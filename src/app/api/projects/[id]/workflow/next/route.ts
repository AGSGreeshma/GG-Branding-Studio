import { moduleSpec } from "@/lib/agents/registry";
import {
  getLatestContext,
  getLockedPaths,
  getModuleResult,
  getProject,
  recordRun,
  saveModuleResult,
  updateProjectWorkflow,
} from "@/lib/db/queries";
import { AppError } from "@/lib/schemas/errors";
import { BattleResultSchema, type BattleResult } from "@/lib/schemas/outputs/battle";
import type { ModuleName } from "@/lib/schemas/workflow";
import { withErrors } from "@/lib/services/route";
import { eventStream } from "@/lib/services/stream";
import { runBattleCritiqueModule, runBattleModule } from "@/lib/services/modules/brand-battle";
import {
  assertTransition,
  completeStep,
  defaultPlanFor,
  nextRunnableStep,
  setStepStatus,
  stateForModule,
} from "@/lib/services/workflow-engine";
import { planWorkflow } from "@/lib/services/workflow-planner";
import { getOwnerId } from "@/lib/session";

/*
 * Runs the next pending module and streams its progress (plan §18.3, §18.4).
 * One module per request; the client calls it again after each step, and only
 * stops when a step needs a decision (ADR-003).
 */

export const dynamic = "force-dynamic";
// Each step is a single model call since ADR-023, so this ceiling is generous
// even on a slow primary model. Measured: generate ~25s, critique ~11s.
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export const POST = withErrors<Params>(async (request, { params }, meta) => {
  const ownerId = await getOwnerId();
  const { id } = await params;
  const project = await getProject(ownerId, id);

  return eventStream(
    async (emit) => {
      const [{ context }, lockedPaths] = await Promise.all([
        getLatestContext(project.id),
        getLockedPaths(project.id),
      ]);

      let plan = project.currentPlanJson ?? defaultPlanFor(project.entryStage);

      // Plan once per project: the reasons only change when the plan does.
      if (plan.reasons_source !== "ai") {
        const planned = await planWorkflow({
          entryStage: project.entryStage,
          plan,
          context,
          lockedPaths,
        });
        plan = planned.plan;
        for (const trace of planned.traces) {
          await recordRun({
            projectId: project.id,
            trace,
            stage: "WORKFLOW_PLANNING",
            status: trace.errorCode ? "failed" : "succeeded",
          }).catch(() => undefined);
        }
        await updateProjectWorkflow(project.id, { plan });
        emit({
          type: "workflow.planned",
          plan,
          fallback_used: plan.fallback_used,
          fallback_reason: planned.fallbackReason,
        });
      }

      const step = nextRunnableStep(plan);
      if (!step) {
        emit({ type: "module.completed", run_id: null, module: "brand_builder", plan, battle: null });
        return;
      }

      const spec = moduleSpec(step.module);
      // The interview has its own endpoint and its own completion rule (§7.4);
      // reaching it here means the interview simply is not finished yet.
      if (step.module === "interviewer") {
        throw new AppError("VALIDATION_ERROR", {
          message: `Interview still in progress for project ${project.id}`,
          publicMessage: "There are still a few questions to answer before the next step.",
          retryable: false,
        });
      }
      if (!spec.implemented) {
        throw new AppError("VALIDATION_ERROR", {
          message: `Module ${step.module} is not implemented yet`,
          publicMessage: `"${spec.label}" arrives in the next build. Your work so far is safe.`,
          retryable: false,
        });
      }

      assertTransition(project.workflowState, stateForModule(step.module));
      plan = setStepStatus(plan, step.module, "running");
      await updateProjectWorkflow(project.id, {
        plan,
        workflowState: stateForModule(step.module),
      });

      emit({ type: "module.started", run_id: null, module: step.module, label: spec.loadingLabel });

      try {
        switch (step.module) {
          case "brand_battle": {
            const battle = await runBattleModule({
              projectId: project.id,
              context,
              emit,
              requestId: meta.requestId,
            });
            await saveModuleResult(project.id, "brand_battle", battle);

            // The directions are worth showing immediately; the critic runs next.
            plan = completeStep(plan, "brand_battle");
            await updateProjectWorkflow(project.id, { plan, workflowState: "POSITIONING" });

            emit({
              type: "module.completed",
              run_id: battle.run_id,
              module: "brand_battle",
              plan,
              battle,
            });
            break;
          }

          case "battle_critique": {
            const stored = BattleResultSchema.safeParse(
              await getModuleResult(project.id, "brand_battle"),
            );
            if (!stored.success || stored.data.directions.length === 0) {
              throw new AppError("NOT_FOUND", {
                message: `No stored directions to critique for project ${project.id}`,
                publicMessage:
                  "The directions to review are missing. Run the Brand Battle again to get a fresh set.",
              });
            }

            const battle: BattleResult = await runBattleCritiqueModule({
              projectId: project.id,
              context,
              battle: stored.data,
              emit,
              requestId: meta.requestId,
            });
            await saveModuleResult(project.id, "brand_battle", battle);

            // The plan only advances once the user has chosen a direction.
            plan = setStepStatus(plan, "battle_critique", "awaiting_decision");
            await updateProjectWorkflow(project.id, { plan, workflowState: "USER_DECISION" });

            emit({
              type: "module.completed",
              run_id: battle.run_id,
              module: "battle_critique",
              plan,
              battle,
            });
            emit({
              type: "decision.required",
              decision_id: `battle:${battle.run_id ?? project.id}`,
              prompt:
                "Three directions are strategically viable. Which one should this brand take?",
              options: battle.directions.map((direction) => direction.name),
            });
            break;
          }

          default:
            throw new AppError("VALIDATION_ERROR", {
              message: `No runner for ${step.module}`,
              publicMessage: `"${spec.label}" arrives in the next build. Your work so far is safe.`,
              retryable: false,
            });
        }
      } catch (err) {
        // Leave the failed step in place so "Try again" re-runs only it.
        await markFailed(project.id, plan, step.module).catch(() => undefined);
        throw err;
      }
    },
    { requestId: meta.requestId, path: request.nextUrl.pathname },
  );
});

async function markFailed(
  projectId: string,
  plan: Parameters<typeof setStepStatus>[0],
  module: ModuleName,
): Promise<void> {
  await updateProjectWorkflow(projectId, { plan: setStepStatus(plan, module, "failed") });
}

import { moduleSpec } from "@/lib/agents/registry";
import {
  getLatestContext,
  getLockedPaths,
  getProject,
  recordRun,
  saveModuleResult,
  updateProjectWorkflow,
} from "@/lib/db/queries";
import { AppError } from "@/lib/schemas/errors";
import { withErrors } from "@/lib/services/route";
import { eventStream } from "@/lib/services/stream";
import { runBattleModule } from "@/lib/services/modules/brand-battle";
import {
  assertTransition,
  defaultPlanFor,
  nextRunnableStep,
  setStepStatus,
  stateForModule,
} from "@/lib/services/workflow-engine";
import { planWorkflow } from "@/lib/services/workflow-planner";
import { getOwnerId } from "@/lib/session";

/*
 * Runs the next pending module and streams its progress (plan §18.3, §18.4).
 * One module per request; the client calls it again after each decision.
 */

export const dynamic = "force-dynamic";
// Battle Lite is two sequential calls. Raising this needs a Vercel plan that
// allows it, so the ceiling stays at the default 60s until real latency is measured.
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export const POST = withErrors<Params>(async (request, { params }, meta) => {
  const ownerId = await getOwnerId();
  const { id } = await params;
  const project = await getProject(ownerId, id);

  return eventStream(
    async (emit) => {
      const [{ context, version }, lockedPaths] = await Promise.all([
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

      switch (step.module) {
        case "brand_battle": {
          const battle = await runBattleModule({
            projectId: project.id,
            context,
            emit,
            requestId: meta.requestId,
          });
          await saveModuleResult(project.id, "brand_battle", battle);

          // The module is done, but the plan only advances once the user chooses.
          plan = setStepStatus(plan, "brand_battle", "awaiting_decision");
          await updateProjectWorkflow(project.id, { plan, workflowState: "USER_DECISION" });

          emit({
            type: "module.completed",
            run_id: battle.run_id,
            module: "brand_battle",
            plan,
            battle,
          });
          emit({
            type: "decision.required",
            decision_id: `battle:${battle.run_id ?? version}`,
            prompt: "Three directions are strategically viable. Which one should this brand take?",
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
    },
    { requestId: meta.requestId, path: request.nextUrl.pathname },
  );
});

import { NextResponse } from "next/server";
import { runBattleMerge, runBattleRevise } from "@/lib/agents/battle";
import { moduleSpec } from "@/lib/agents/registry";
import {
  getLatestContext,
  getLockedPaths,
  getModuleResult,
  getProject,
  recordRun,
  saveContext,
  saveDecision,
  saveModuleResult,
  updateProjectWorkflow,
} from "@/lib/db/queries";
import { AppError } from "@/lib/schemas/errors";
import {
  BattleActionSchema,
  type BattleActionResponse,
} from "@/lib/schemas/battle-actions";
import {
  BattleResultSchema,
  type BattleDirection,
  type BattleResult,
} from "@/lib/schemas/outputs/battle";
import { MODULE_NAMES, type ModuleName } from "@/lib/schemas/workflow";
import { applyContextWrites, type ContextWrite } from "@/lib/services/context-manager";
import { logEvent } from "@/lib/services/log";
import { runBattleModule, sliceForBattle } from "@/lib/services/modules/brand-battle";
import { withErrors } from "@/lib/services/route";
import { completeStep, defaultPlanFor, setStepStatus } from "@/lib/services/workflow-engine";
import { getOwnerId } from "@/lib/session";

/*
 * Explicit module runs (plan §18.3): the user's own actions on a module's
 * results. The orchestrator calls the same agents internally through
 * /workflow/next; this route exists for Choose, Combine, Revise and
 * "Generate another battle" (§11.1, §14.3).
 *
 * JSON rather than SSE: each action is one call with its own loading message.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; module: string }> };

function parseModule(value: string): ModuleName {
  const name = value.replace(/-/g, "_");
  if (!(MODULE_NAMES as readonly string[]).includes(name)) {
    throw new AppError("NOT_FOUND", { message: `Unknown module ${value}` });
  }
  return name as ModuleName;
}

function requireDirection(battle: BattleResult, id: string): BattleDirection {
  const direction = battle.directions.find((entry) => entry.id === id);
  if (!direction) {
    throw new AppError("VALIDATION_ERROR", {
      message: `Direction ${id} is not part of this battle`,
      publicMessage: "That direction is no longer on the table. Refresh to see the current ones.",
    });
  }
  return direction;
}

/** The Brand Context fields a chosen direction writes (registry `produces`). */
function writesForDirection(direction: BattleDirection, runId: string | null): ContextWrite[] {
  const evidence = `Brand Battle direction "${direction.name}"`;
  return [
    {
      path: "selected_direction",
      value: {
        name: direction.name,
        source_module: "brand_battle",
        summary: direction.positioning.statement,
        run_id: runId,
      },
      evidence,
    },
    { path: "positioning.category", value: direction.positioning.category, evidence },
    { path: "positioning.statement", value: direction.positioning.statement, evidence },
    { path: "positioning.differentiator", value: direction.positioning.differentiator, evidence },
    {
      path: "positioning.value_proposition",
      value: direction.positioning.value_proposition,
      evidence,
    },
    { path: "personality.traits", value: direction.personality, evidence },
  ];
}

export const POST = withErrors<Params>(async (request, { params }, meta) => {
  const ownerId = await getOwnerId();
  const { id, module: moduleParam } = await params;
  const moduleName = parseModule(moduleParam);
  const project = await getProject(ownerId, id);

  if (moduleName !== "brand_battle") {
    const spec = moduleSpec(moduleName);
    throw new AppError("VALIDATION_ERROR", {
      message: `Module ${moduleName} has no explicit runner yet`,
      publicMessage: `"${spec.label}" arrives in the next build.`,
      retryable: false,
    });
  }

  const body = BattleActionSchema.parse(await request.json());
  const [{ context, version }, lockedPaths] = await Promise.all([
    getLatestContext(project.id),
    getLockedPaths(project.id),
  ]);

  const stored = BattleResultSchema.safeParse(await getModuleResult(project.id, "brand_battle"));
  if (!stored.success && body.action !== "regenerate") {
    throw new AppError("NOT_FOUND", {
      message: `No stored battle for project ${project.id}`,
      publicMessage: "This battle is no longer available. Run it again to see fresh directions.",
    });
  }
  let battle: BattleResult = stored.success
    ? stored.data
    : { directions: [], critique: null, divergence_note: null, run_id: null };

  let plan = project.currentPlanJson ?? defaultPlanFor(project.entryStage);
  let nextContext = context;
  let nextVersion = version;
  let blockedPaths: string[] = [];
  let chosenDirectionId: BattleActionResponse["chosen_direction_id"] = null;

  switch (body.action) {
    case "regenerate": {
      // The whole module runs again, without streaming: one loading message covers it.
      battle = await runBattleModule({
        projectId: project.id,
        context,
        emit: () => {},
        requestId: meta.requestId,
        note: body.note ?? null,
      });
      await saveModuleResult(project.id, "brand_battle", battle);
      break;
    }

    case "merge": {
      const [firstId, secondId] = body.direction_ids;
      const first = requireDirection(battle, firstId!);
      const second = requireDirection(battle, secondId!);
      const merged = await runBattleMerge(
        sliceForBattle(context),
        first,
        second,
        body.instruction ?? null,
      );
      await recordRun({
        projectId: project.id,
        trace: merged.trace,
        module: "brand_battle",
        stage: "POSITIONING",
        parentRunId: battle.run_id,
        outputContext: merged.direction,
      }).catch(() => undefined);

      battle = {
        ...battle,
        // The merged card joins the three; nothing is thrown away.
        directions: [
          ...battle.directions.filter((direction) => direction.id !== "merged"),
          merged.direction,
        ],
        divergence_note: merged.note || battle.divergence_note,
      };
      await saveModuleResult(project.id, "brand_battle", battle);
      break;
    }

    case "revise": {
      const target = requireDirection(battle, body.direction_id);
      const revised = await runBattleRevise(sliceForBattle(context), target, body.instruction);
      await recordRun({
        projectId: project.id,
        trace: revised.trace,
        module: "brand_battle",
        stage: "POSITIONING",
        parentRunId: battle.run_id,
        outputContext: revised.direction,
      }).catch(() => undefined);

      battle = {
        ...battle,
        directions: battle.directions.map((direction) =>
          direction.id === revised.direction.id ? revised.direction : direction,
        ),
        // The stored critique described the old text, so it no longer applies to this card.
        critique: battle.critique
          ? {
              ...battle.critique,
              critiques: battle.critique.critiques.filter(
                (entry) => entry.direction_id !== revised.direction.id,
              ),
            }
          : null,
        divergence_note: revised.note || battle.divergence_note,
      };
      await saveModuleResult(project.id, "brand_battle", battle);
      break;
    }

    case "choose": {
      const direction = requireDirection(battle, body.direction_id);
      if (body.expected_version !== version) {
        throw new AppError("CONFLICT", {
          message: `Stale context version ${body.expected_version}, current ${version}`,
        });
      }

      const applied = applyContextWrites(
        context,
        writesForDirection(direction, battle.run_id),
        {
          agent: "brand_battle",
          // The value was written by the AI; the decision to accept it is the user's.
          source: "agent",
          runId: battle.run_id,
          lockedPaths,
        },
      );
      blockedPaths = applied.blockedPaths;
      if (blockedPaths.length) {
        logEvent("warn", "context.locked_paths_skipped", {
          request_id: meta.requestId,
          project_id: project.id,
          paths: blockedPaths.join(","),
        });
      }

      const saved = await saveContext(project.id, applied.context, version);
      nextContext = saved.context;
      nextVersion = saved.version;
      chosenDirectionId = direction.id;

      for (const path of applied.changedPaths) {
        await saveDecision({
          projectId: project.id,
          path,
          value: (applied.context as unknown as Record<string, unknown>)[path.split(".")[0]!],
          locked: body.lock,
          reason: `Chose the "${direction.name}" direction from the Brand Battle.`,
          source: "ai_accepted",
          runId: battle.run_id,
        }).catch(() => undefined);
      }

      plan = completeStep(plan, "brand_battle");
      await updateProjectWorkflow(project.id, { plan, workflowState: "WORKFLOW_PLANNING" });
      logEvent("info", "battle.direction_chosen", {
        request_id: meta.requestId,
        project_id: project.id,
        direction_id: direction.id,
        locked: body.lock,
      });
      break;
    }
  }

  if (body.action !== "choose") {
    // Still the user's move.
    plan = setStepStatus(plan, "brand_battle", "awaiting_decision");
    await updateProjectWorkflow(project.id, { plan, workflowState: "USER_DECISION" });
  }

  return NextResponse.json({
    battle,
    context: nextContext,
    version: nextVersion,
    plan,
    blocked_paths: blockedPaths,
    chosen_direction_id: chosenDirectionId,
  } satisfies BattleActionResponse);
});

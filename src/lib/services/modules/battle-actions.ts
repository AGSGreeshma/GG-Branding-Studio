import "server-only";
import { runBattleMerge, runBattleRevise } from "@/lib/agents/battle";
import type { Project } from "@/lib/db/schema";
import {
  getLatestContext,
  getLockedPaths,
  getModuleResult,
  recordRun,
  saveContext,
  saveDecision,
  saveModuleResult,
  updateProjectWorkflow,
} from "@/lib/db/queries";
import {
  BattleActionSchema,
  type BattleActionResponse,
} from "@/lib/schemas/battle-actions";
import { AppError } from "@/lib/schemas/errors";
import {
  BattleResultSchema,
  type BattleDirection,
  type BattleResult,
} from "@/lib/schemas/outputs/battle";
import { applyContextWrites, type ContextWrite } from "../context-manager";
import { logEvent } from "../log";
import { completeStep, defaultPlanFor, setStepStatus } from "../workflow-engine";
import { runBattleModule, sliceForBattle } from "./brand-battle";

/*
 * The user's own actions on a Brand Battle (plan §11.1, §14.3):
 * Choose · Combine · Ask AI to revise · Generate another battle.
 */

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

export async function handleBattleAction(input: {
  project: Project;
  body: unknown;
  requestId: string;
}): Promise<BattleActionResponse> {
  const { project, requestId } = input;
  const body = BattleActionSchema.parse(input.body);

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
      // Generation only (ADR-023). The client then runs the critique step,
      // exactly as it would after the first battle.
      battle = await runBattleModule({
        projectId: project.id,
        context,
        emit: () => {},
        requestId,
        note: body.note ?? null,
      });
      await saveModuleResult(project.id, "brand_battle", battle);
      plan = setStepStatus(plan, "brand_battle", "complete");
      plan = setStepStatus(plan, "battle_critique", "pending");
      await updateProjectWorkflow(project.id, { plan, workflowState: "POSITIONING" });
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

      const applied = applyContextWrites(context, writesForDirection(direction, battle.run_id), {
        agent: "brand_battle",
        // The value was written by the AI; the decision to accept it is the user's.
        source: "agent",
        runId: battle.run_id,
        lockedPaths,
      });
      blockedPaths = applied.blockedPaths;
      if (blockedPaths.length) {
        logEvent("warn", "context.locked_paths_skipped", {
          request_id: requestId,
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
      plan = completeStep(plan, "battle_critique");
      await updateProjectWorkflow(project.id, { plan, workflowState: "WORKFLOW_PLANNING" });
      logEvent("info", "battle.direction_chosen", {
        request_id: requestId,
        project_id: project.id,
        direction_id: direction.id,
        locked: body.lock,
      });
      break;
    }
  }

  if (body.action === "merge" || body.action === "revise") {
    // Still the user's move.
    plan = setStepStatus(plan, "battle_critique", "awaiting_decision");
    await updateProjectWorkflow(project.id, { plan, workflowState: "USER_DECISION" });
  }

  return {
    battle,
    context: nextContext,
    version: nextVersion,
    plan,
    blocked_paths: blockedPaths,
    chosen_direction_id: chosenDirectionId,
  };
}

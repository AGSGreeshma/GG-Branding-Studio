import "server-only";
import {
  checkDivergence,
  runBattleChallenge,
  runBattleGenerate,
  type GenerateResult,
} from "@/lib/agents/battle";
import { recordRun } from "@/lib/db/queries";
import type { BrandContext } from "@/lib/schemas/brand-context";
import {
  LENS_LABELS,
  type BattleDirection,
  type BattleResult,
  type DirectionCritique,
} from "@/lib/schemas/outputs/battle";
import type { BattleSlice } from "@/lib/prompts/battle";
import { logEvent } from "../log";
import type { Emit } from "../stream";

/*
 * Brand Battle Lite runner (plan §14.3, K6–K8 in their two-call form).
 * The agents stay pure; this service persists the runs and narrates progress
 * so the workspace can show which role is working (plan §18.4).
 */

export function sliceForBattle(context: BrandContext): BattleSlice {
  return {
    problem: context.problem,
    audience: context.audience,
    product: context.product,
    assumptions: context.meta.assumptions,
  };
}

/** Severity for a critic finding, from the scores it came with (§13.5 thresholds). */
function severityFor(critique: DirectionCritique): "low" | "medium" | "high" {
  if (critique.scores.genericity_risk >= 7 || critique.scores.distinctiveness <= 4) return "high";
  if (critique.scores.genericity_risk >= 5 || critique.scores.distinctiveness <= 6) return "medium";
  return "low";
}

function directionLabel(direction: BattleDirection): string {
  return `Direction ${direction.id.toUpperCase()}`;
}

export interface RunBattleInput {
  projectId: string;
  context: BrandContext;
  emit: Emit;
  requestId: string;
  /** Carried into the prompt when the user asks for a different battle. */
  note?: string | null;
}

/**
 * Two model calls: generate three directions, then challenge them.
 * Both are recorded in `workflow_runs`, the critique as a child of the
 * generation run, with the scores in `evaluation_json` (E11).
 */
export async function runBattleModule(input: RunBattleInput): Promise<BattleResult> {
  const { projectId, context, emit } = input;
  const slice = sliceForBattle(context);

  emit({
    type: "module.progress",
    run_id: null,
    message: "Strategist, Creative Director and Audience Advocate are drafting…",
  });

  let generated: GenerateResult;
  try {
    generated = await runBattleGenerate(slice, input.note ?? null);
  } catch (err) {
    await recordFailure(projectId, err);
    throw err;
  }

  let directions = generated.directions;
  let divergenceNote: string | null = null;

  // Divergence check in code: three versions of one idea is not a battle (§14.3).
  const divergence = checkDivergence(directions);
  if (!divergence.ok) {
    logEvent("warn", "battle.collision", { project_id: projectId, note: divergence.message ?? "" });
    emit({
      type: "module.progress",
      run_id: null,
      message: "Two directions came out too alike — asking for a sharper split…",
    });
    try {
      const retry = await runBattleGenerate(
        slice,
        `${divergence.message} Make every direction aim at a different audience or claim a different category.`,
      );
      directions = retry.directions;
      divergenceNote = divergence.message;
      await recordRun({
        projectId,
        trace: retry.trace,
        module: "brand_battle",
        stage: "POSITIONING",
        outputContext: { directions: retry.directions, regenerated: true },
      }).catch(() => undefined);
    } catch {
      // A failed second attempt is not worth losing the first three directions over.
      divergenceNote = `${divergence.message} The second attempt failed, so these are the originals.`;
    }
  }

  const parentRunId = await recordRun({
    projectId,
    trace: generated.trace,
    module: "brand_battle",
    stage: "POSITIONING",
    outputContext: { directions },
  });

  for (const direction of directions) {
    emit({
      type: "agent.completed",
      run_id: parentRunId,
      parent_run_id: null,
      agent: LENS_LABELS[direction.lens],
      summary: `${directionLabel(direction)}: ${direction.name}`,
    });
  }

  for (const direction of directions) {
    emit({
      type: "module.progress",
      run_id: parentRunId,
      message: `Skeptic is challenging ${directionLabel(direction)}…`,
    });
  }

  let critique: BattleResult["critique"] = null;
  try {
    const challenged = await runBattleChallenge(slice, directions);
    critique = challenged.critique;

    await recordRun({
      projectId,
      trace: challenged.trace,
      module: "brand_battle",
      stage: "CRITIQUE",
      parentRunId,
      outputContext: challenged.critique,
      evaluation: Object.fromEntries(
        challenged.critique.critiques.map((entry) => [entry.direction_id, entry.scores]),
      ),
    }).catch(() => undefined);

    for (const entry of challenged.critique.critiques) {
      const severity = severityFor(entry);
      for (const objection of entry.objections) {
        emit({
          type: "critique.finding",
          run_id: parentRunId,
          target_path: `battle.${entry.direction_id}`,
          kind: "objection",
          severity,
          detail: objection.claim,
        });
      }
      for (const cliche of entry.cliches) {
        emit({
          type: "critique.finding",
          run_id: parentRunId,
          target_path: `battle.${entry.direction_id}`,
          kind: "cliche",
          severity: "medium",
          detail: cliche,
        });
      }
    }

    emit({
      type: "agent.completed",
      run_id: parentRunId,
      parent_run_id: parentRunId,
      agent: "Skeptic & Differentiation Expert",
      summary: `Recommends ${challenged.critique.recommendation.direction_id.toUpperCase()}`,
    });
  } catch (err) {
    // The directions are worth showing even when the critic call fails.
    await recordFailure(projectId, err, parentRunId);
    logEvent("warn", "battle.critique_failed", { project_id: projectId });
    emit({
      type: "module.progress",
      run_id: parentRunId,
      message: "The critique didn't come back this time — showing the directions without it.",
    });
  }

  return { directions, critique, divergence_note: divergenceNote, run_id: parentRunId };
}

async function recordFailure(projectId: string, err: unknown, parentRunId?: string) {
  const trace = (err as { trace?: unknown }).trace;
  if (!trace) return;
  await recordRun({
    projectId,
    trace: trace as Parameters<typeof recordRun>[0]["trace"],
    module: "brand_battle",
    stage: "POSITIONING",
    parentRunId: parentRunId ?? null,
    status: "failed",
  }).catch(() => undefined);
}

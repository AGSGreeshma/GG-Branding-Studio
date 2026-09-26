import "server-only";
import {
  runWorldsExplore,
  runWorldsGenerate,
  sliceForWorlds,
  worldsAreDistinct,
} from "@/lib/agents/five-worlds";
import { recordRun } from "@/lib/db/queries";
import type { BrandContext } from "@/lib/schemas/brand-context";
import type { World, WorldsResult } from "@/lib/schemas/outputs/worlds";
import { logEvent } from "../log";
import type { Emit } from "../stream";

/*
 * Five Worlds runner (plan §14.5, M1–M9).
 * The agent stays pure; this persists the run, narrates progress and folds
 * the deterministic visual checks into the stored result.
 */

async function recordFailure(projectId: string, err: unknown) {
  const trace = (err as { trace?: unknown }).trace;
  if (!trace) return;
  await recordRun({
    projectId,
    trace: trace as Parameters<typeof recordRun>[0]["trace"],
    module: "five_worlds",
    stage: "EXPLORATION",
    status: "failed",
  }).catch(() => undefined);
}

/** A one-line summary of what the checks found, for the progress stream. */
function checkSummary(result: WorldsResult): string | null {
  const issues = result.checks.flatMap((check) => check.issues);
  if (issues.length === 0) return null;
  const high = issues.filter((issue) => issue.severity === "high").length;
  return high > 0
    ? `${high} colour or font problem${high === 1 ? "" : "s"} found and flagged on the cards.`
    : `${issues.length} minor visual note${issues.length === 1 ? "" : "s"} added to the cards.`;
}

export interface RunWorldsInput {
  projectId: string;
  context: BrandContext;
  emit: Emit;
  requestId: string;
  note?: string | null;
}

/** The first three worlds. */
export async function runWorldsModule(input: RunWorldsInput): Promise<WorldsResult> {
  const { projectId, context, emit } = input;
  const slice = sliceForWorlds(context);

  emit({
    type: "module.progress",
    run_id: null,
    message: `Building three identity worlds around "${slice.direction_name || "your direction"}"…`,
  });

  let generated;
  try {
    generated = await runWorldsGenerate(slice, input.note ?? null);
  } catch (err) {
    await recordFailure(projectId, err);
    throw err;
  }

  const runId = await recordRun({
    projectId,
    trace: generated.trace,
    module: "five_worlds",
    stage: "EXPLORATION",
    outputContext: { worlds: generated.worlds },
  });

  for (const world of generated.worlds) {
    emit({
      type: "agent.completed",
      run_id: runId,
      parent_run_id: null,
      agent: "Identity director",
      summary: `${world.name} — ${world.personality.join(", ")}`,
    });
  }

  // Deterministic checks are findings too: a palette nobody can read is a
  // real problem with the output, not a rendering detail (§14.8).
  for (const check of generated.checks) {
    for (const issue of check.issues) {
      emit({
        type: "critique.finding",
        run_id: runId,
        target_path: `world.${check.world_id}`,
        kind: issue.kind,
        severity: issue.severity,
        detail: issue.message,
      });
    }
  }

  if (!worldsAreDistinct(generated.worlds)) {
    logEvent("warn", "worlds.similar_personalities", { project_id: projectId });
    emit({
      type: "module.progress",
      run_id: runId,
      message: "Two worlds share a personality — worth regenerating if they feel alike.",
    });
  }

  const summary = checkSummary({ worlds: generated.worlds, checks: generated.checks, note: null, run_id: runId });
  if (summary) emit({ type: "module.progress", run_id: runId, message: summary });

  return { worlds: generated.worlds, checks: generated.checks, note: null, run_id: runId };
}

/** "Explore 2 more worlds": w4 and w5 appended to the stored result. */
export async function exploreMoreWorlds(
  input: RunWorldsInput & { existing: WorldsResult },
): Promise<WorldsResult> {
  const { projectId, context, existing } = input;
  const slice = sliceForWorlds(context);

  const base = existing.worlds.filter((world) => world.id !== "w4" && world.id !== "w5");
  let explored;
  try {
    explored = await runWorldsExplore(slice, base);
  } catch (err) {
    await recordFailure(projectId, err);
    throw err;
  }

  await recordRun({
    projectId,
    trace: explored.trace,
    module: "five_worlds",
    stage: "EXPLORATION",
    parentRunId: existing.run_id,
    outputContext: { worlds: explored.worlds },
  }).catch(() => undefined);

  const worlds: World[] = [...base, ...explored.worlds];
  const checks = [
    ...existing.checks.filter((check) => check.world_id !== "w4" && check.world_id !== "w5"),
    ...explored.checks,
  ];
  return { ...existing, worlds, checks, note: null };
}

import "server-only";
import { recordRun } from "@/lib/db/queries";
import type { BrandContext } from "@/lib/schemas/brand-context";
import type { AntiGenericResult } from "@/lib/schemas/outputs/anti-generic";
import {
  collectFields,
  maxRounds,
  runAntiGenericRound,
  sliceForAntiGeneric,
} from "../anti-generic";
import { logEvent } from "../log";
import type { Emit } from "../stream";

/*
 * Anti-Generic workflow step (plan §14.6, N10, N13).
 *
 * One round per request (ADR-027), so a two-round loop is two short requests
 * rather than one long one, and a failure only costs the round it happened in.
 * The engine itself lives in services/anti-generic.ts so other modules can
 * call it without going through the workflow.
 */

export interface RunAntiGenericInput {
  projectId: string;
  context: BrandContext;
  lockedPaths: readonly string[];
  /** Null on the first request; the stored state on later rounds. */
  previous: AntiGenericResult | null;
  emit: Emit;
  requestId: string;
}

async function recordFailure(projectId: string, err: unknown) {
  const trace = (err as { trace?: unknown }).trace;
  if (!trace) return;
  await recordRun({
    projectId,
    trace: trace as Parameters<typeof recordRun>[0]["trace"],
    module: "anti_generic",
    stage: "CRITIQUE",
    status: "failed",
  }).catch(() => undefined);
}

/** Runs one round and returns the accumulated state. */
export async function runAntiGenericModule(
  input: RunAntiGenericInput,
): Promise<AntiGenericResult> {
  const { projectId, context, lockedPaths, previous, emit } = input;

  const fields = previous?.fields ?? collectFields(context, lockedPaths);
  if (fields.length === 0) {
    // Nothing written yet that this engine knows how to judge.
    return { fields: [], rounds: [], complete: true, applied: true, run_id: null };
  }

  const roundNumber = (previous?.rounds.length ?? 0) + 1;
  const cap = maxRounds();

  emit({
    type: "module.progress",
    run_id: previous?.run_id ?? null,
    message:
      roundNumber === 1
        ? `Round 1: challenging ${fields.length} ${fields.length === 1 ? "line" : "lines"} of brand language…`
        : `Round ${roundNumber} of ${cap}: checking whether the rewrites hold up…`,
  });

  let output;
  try {
    output = await runAntiGenericRound({
      slice: sliceForAntiGeneric(context),
      fields,
      roundNumber,
      maxRounds: cap,
      onProgress: (message) =>
        emit({ type: "module.progress", run_id: previous?.run_id ?? null, message }),
    });
  } catch (err) {
    await recordFailure(projectId, err);
    throw err;
  }

  let runId = previous?.run_id ?? null;
  for (const trace of output.traces) {
    const id = await recordRun({
      projectId,
      trace,
      module: "anti_generic",
      stage: "CRITIQUE",
      parentRunId: runId,
      outputContext: { round: roundNumber },
      evaluation: Object.fromEntries(
        output.round.findings.map((finding) => [finding.target_path, finding.scores]),
      ),
    }).catch(() => null);
    runId ??= id;
  }

  // Every finding the user should see, streamed as it happens.
  for (const entry of output.round.lexicon) {
    for (const hit of entry.hits) {
      emit({
        type: "critique.finding",
        run_id: runId,
        target_path: entry.path,
        kind: hit.kind,
        severity: hit.severity,
        detail: `"${hit.match}" — ${hit.note}`,
      });
    }
  }
  for (const finding of output.round.findings) {
    for (const issue of finding.issues) {
      emit({
        type: "critique.finding",
        run_id: runId,
        target_path: finding.target_path,
        kind: issue.kind,
        severity: issue.severity,
        detail: `${issue.note} ("${issue.evidence}")`,
      });
    }
  }
  for (const change of output.round.changes) {
    emit({
      type: "agent.completed",
      run_id: runId,
      parent_run_id: runId,
      agent: "Anti-Generic",
      summary: `${change.label}: ${change.reason}`,
    });
  }

  if (output.done) {
    logEvent("info", "anti_generic.finished", {
      project_id: projectId,
      rounds: roundNumber,
      changes: output.round.changes.length,
    });
  }

  return {
    fields: output.fields,
    rounds: [...(previous?.rounds ?? []), output.round],
    complete: output.done,
    applied: false,
    run_id: runId,
  };
}

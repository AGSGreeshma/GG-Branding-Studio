import "server-only";
import { runAntiGenericCritic, runAntiGenericReviser } from "@/lib/agents/anti-generic";
import type { LlmTrace } from "@/lib/ai/types";
import { detectGeneric, hasHighSeverity, type LexiconHit } from "@/lib/lexicon/detect";
import type { AntiGenericSlice, FieldInput } from "@/lib/prompts/anti-generic";
import type { BrandContext } from "@/lib/schemas/brand-context";
import type {
  AntiGenericField,
  CriticFinding,
  FieldChange,
  GenericScores,
  Round,
} from "@/lib/schemas/outputs/anti-generic";
import { isPathLocked } from "./context-manager";
import { readContextPath } from "./workflow-engine";

/*
 * The Anti-Generic Engine as a service (plan §14.6, §13.5, N10, N13).
 *
 * Written to be called by anything, not just its own workflow step: the
 * Launch Kit and the Consistency Guardian will hand it their own fields.
 * One round = one critic call plus, when something crossed a threshold, one
 * reviser call. The caller decides how many rounds to run and persists them.
 */

/** §13.5 thresholds. A field crossing any of these is rewritten. */
export const TRIGGER = {
  genericityRiskAtLeast: 5,
  distinctivenessAtMost: 6,
  audienceFitAtMost: 6,
} as const;

export const DEFAULT_MAX_ROUNDS = 2;

/**
 * One number for "is this line better than it was" (ADR-029).
 * Genericity risk counts against; the other three count for. Used only to
 * compare two versions of the same field judged by the same critic, never as
 * a score shown to the user.
 */
export function qualityScore(scores: GenericScores): number {
  return (
    scores.distinctiveness + scores.audience_fit + scores.specificity - scores.genericity_risk
  );
}

/** `ANTI_GENERIC_MAX_ROUNDS`, clamped to something sane. */
export function maxRounds(): number {
  const raw = process.env.ANTI_GENERIC_MAX_ROUNDS;
  if (!raw) return DEFAULT_MAX_ROUNDS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_ROUNDS;
  return Math.min(parsed, 5);
}

/** The Brand Context fields this engine may improve, in the order shown. */
export const ANTI_GENERIC_FIELDS: Array<{ path: string; label: string; purpose: string }> = [
  {
    path: "positioning.statement",
    label: "Positioning statement",
    purpose: "one sentence saying what this is and for whom",
  },
  {
    path: "positioning.differentiator",
    label: "Differentiator",
    purpose: "the thing a competitor could not equally claim",
  },
  {
    path: "positioning.value_proposition",
    label: "Value proposition",
    purpose: "what the audience actually gets, in their words",
  },
  {
    path: "identity.naming_direction",
    label: "Naming direction",
    purpose: "the territory the brand's names should live in",
  },
  {
    path: "identity.tagline",
    label: "Tagline",
    purpose: "the line that sits under the name",
  },
  {
    path: "messaging.one_line_pitch",
    label: "One-line pitch",
    purpose: "how the founder introduces this in one sentence",
  },
];

export function sliceForAntiGeneric(context: BrandContext): AntiGenericSlice {
  return {
    problem: context.problem.statement,
    audience: context.audience.primary,
    product: context.product.description,
    positioning: context.positioning.statement,
    differentiator: context.positioning.differentiator,
    alternatives: context.problem.existing_alternatives,
  };
}

/** Every field with content, marked with whether the user has locked it. */
export function collectFields(
  context: BrandContext,
  lockedPaths: readonly string[],
): AntiGenericField[] {
  const fields: AntiGenericField[] = [];
  for (const definition of ANTI_GENERIC_FIELDS) {
    const value = readContextPath(context, definition.path);
    if (typeof value !== "string" || !value.trim()) continue;
    fields.push({
      path: definition.path,
      label: definition.label,
      original: value,
      current: value,
      locked: isPathLocked(definition.path, lockedPaths),
      previous: null,
      best_quality: null,
    });
  }
  return fields;
}

function purposeFor(path: string): string {
  return ANTI_GENERIC_FIELDS.find((field) => field.path === path)?.purpose ?? "";
}

function toFieldInput(field: AntiGenericField): FieldInput {
  return {
    path: field.path,
    label: field.label,
    text: field.current,
    purpose: purposeFor(field.path),
  };
}

/**
 * Whether one field crosses a revision threshold (§13.5). A high-severity
 * lexicon hit is enough on its own: the word list does not need the model to
 * agree that "world-class" says nothing.
 */
export function shouldRevise(
  finding: CriticFinding | undefined,
  hits: readonly LexiconHit[],
): boolean {
  if (hasHighSeverity(hits)) return true;
  if (!finding) return false;
  const { genericity_risk, distinctiveness, audience_fit } = finding.scores;
  return (
    genericity_risk >= TRIGGER.genericityRiskAtLeast ||
    distinctiveness <= TRIGGER.distinctivenessAtMost ||
    audience_fit <= TRIGGER.audienceFitAtMost
  );
}

/** The unlocked fields that crossed a threshold this round. */
export function triggeredPaths(
  fields: readonly AntiGenericField[],
  findings: readonly CriticFinding[],
  lexicon: Record<string, LexiconHit[]>,
): string[] {
  return fields
    .filter((field) => {
      // Locked decisions are constraints, not suggestions (plan §11.2).
      if (field.locked) return false;
      const finding = findings.find((entry) => entry.target_path === field.path);
      return shouldRevise(finding, lexicon[field.path] ?? []);
    })
    .map((field) => field.path);
}

export interface RoundInput {
  slice: AntiGenericSlice;
  fields: AntiGenericField[];
  roundNumber: number;
  /** Rounds allowed in total, so the last one knows to stop. */
  maxRounds: number;
  /** Progress for the workspace, e.g. "Challenging the positioning…". */
  onProgress?: (message: string) => void;
}

export interface RoundOutput {
  round: Round;
  /** The fields after this round; unchanged ones are returned as they were. */
  fields: AntiGenericField[];
  /** True when nothing needs another round. */
  done: boolean;
  traces: LlmTrace[];
}

/**
 * One round: check the word lists, ask the critic, and rewrite whatever
 * crossed a threshold. Returns the updated fields and whether the loop is
 * finished, so the caller can persist and decide about the next request.
 */
export async function runAntiGenericRound(input: RoundInput): Promise<RoundOutput> {
  const { slice, fields, roundNumber } = input;
  const traces: LlmTrace[] = [];
  /*
   * The last round is a verification pass: it judges the previous round's
   * rewrites and does not produce new ones, so the text the user is shown has
   * always been scored by the critic (ADR-029).
   */
  const isFinalRound = roundNumber >= input.maxRounds;

  // 1. Deterministic pass first: it is free and it informs the critic (N12).
  const lexicon: Record<string, LexiconHit[]> = {};
  for (const field of fields) {
    lexicon[field.path] = detectGeneric(field.current);
  }

  input.onProgress?.("Checking the language against the cliché lists…");

  // 2. The critic judges every field, including locked ones, so the user sees
  //    the score even where the engine is not allowed to change anything.
  const { critique, trace: criticTrace } = await runAntiGenericCritic(
    slice,
    fields.map(toFieldInput),
    lexicon,
  );
  traces.push(criticTrace);

  /*
   * 3. Keep a rewrite only if the critic scored it better than what it
   *    replaced. Without this the loop happily rewrites text that was already
   *    fine and sometimes makes it worse — which is what the first eval run
   *    showed (ADR-029).
   */
  const reverted: Round["reverted"] = [];
  let judged = fields.map((field) => {
    const finding = critique.findings.find((entry) => entry.target_path === field.path);
    if (!finding) return field;
    const quality = qualityScore(finding.scores);

    if (field.previous !== null && field.best_quality !== null && quality < field.best_quality) {
      reverted.push({
        path: field.path,
        label: field.label,
        kept: field.previous,
        discarded: field.current,
      });
      return { ...field, current: field.previous, previous: null };
    }
    return { ...field, previous: null, best_quality: quality };
  });

  const revertedPaths = new Set(reverted.map((entry) => entry.path));
  const scoresAfterRevert = (path: string) =>
    revertedPaths.has(path)
      ? undefined
      : critique.findings.find((entry) => entry.target_path === path);

  // A reverted field is not a candidate for another rewrite this round: the
  // model has already had its go at it and lost.
  const candidates = judged.filter((field) => !revertedPaths.has(field.path));
  const triggered = isFinalRound
    ? []
    : triggeredPaths(candidates, critique.findings, lexicon);
  const lexiconRecord = Object.entries(lexicon).map(([path, hits]) => ({ path, hits }));

  if (triggered.length === 0) {
    return {
      round: {
        round: roundNumber,
        findings: critique.findings,
        lexicon: lexiconRecord,
        triggered_paths: [],
        changes: [],
        reverted,
        stopped_because: isFinalRound
          ? `Stopped after ${input.maxRounds} ${input.maxRounds === 1 ? "round" : "rounds"}; any remaining concerns are listed above.`
          : "Nothing crossed a revision threshold.",
      },
      fields: judged,
      done: true,
      traces,
    };
  }

  input.onProgress?.(
    `Rewriting ${triggered.length} ${triggered.length === 1 ? "line" : "lines"} the critic rejected…`,
  );

  // 4. Rewrite only those fields.
  const toRevise = judged.filter((field) => triggered.includes(field.path));
  const { revisions, trace: reviserTrace } = await runAntiGenericReviser(
    slice,
    toRevise.map(toFieldInput),
    critique.findings,
  );
  traces.push(reviserTrace);

  const changes: FieldChange[] = [];
  judged = judged.map((field) => {
    const revision = revisions.find((entry) => entry.target_path === field.path);
    // Belt and braces: the agent already filters, and a locked field can never
    // reach this point, but the rule is enforced where the write happens.
    if (!revision || field.locked || !triggered.includes(field.path)) return field;
    if (revision.improved === field.current) return field;

    changes.push({
      path: field.path,
      label: field.label,
      before: field.current,
      after: revision.improved,
      reason: revision.reason,
    });
    // Remember what this replaced, and how good it was, so the next round can
    // undo the change if the rewrite turns out to be worse.
    return {
      ...field,
      previous: field.current,
      best_quality: scoresAfterRevert(field.path)
        ? qualityScore(scoresAfterRevert(field.path)!.scores)
        : field.best_quality,
      current: revision.improved,
    };
  });

  return {
    round: {
      round: roundNumber,
      findings: critique.findings,
      lexicon: lexiconRecord,
      triggered_paths: triggered,
      changes,
      reverted,
      stopped_because: null,
    },
    fields: judged,
    // A rewrite always earns a verification round, so the loop only ends here
    // when nothing actually changed.
    done: changes.length === 0,
    traces,
  };
}

/** Score movement between the first and last round, for the UI (§13.5). */
export function scoreDeltas(
  rounds: readonly Round[],
): Array<{ path: string; before: CriticFinding["scores"]; after: CriticFinding["scores"] }> {
  if (rounds.length === 0) return [];
  const first = rounds[0]!;
  const last = rounds[rounds.length - 1]!;
  if (rounds.length === 1) return [];

  const deltas: Array<{ path: string; before: CriticFinding["scores"]; after: CriticFinding["scores"] }> = [];
  for (const finding of first.findings) {
    const after = last.findings.find((entry) => entry.target_path === finding.target_path);
    if (after) deltas.push({ path: finding.target_path, before: finding.scores, after: after.scores });
  }
  return deltas;
}

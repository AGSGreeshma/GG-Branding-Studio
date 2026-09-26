import { z } from "zod";

/*
 * Anti-Generic Engine (plan §14.6, §13.5, N1–N13).
 *
 * Two model calls with one job each: a critic that judges, and a reviser that
 * rewrites only what the critic flagged. They are separate so the thing that
 * grades is never the thing that wrote (CLAUDE.md, AI rule 8), and so a
 * revision round can be skipped entirely when nothing is wrong.
 *
 * Strict-mode rules apply: all required, no optionals, no ranges.
 */

export const ISSUE_KINDS = [
  "buzzword",
  "empty_claim",
  "cliche",
  "weak_differentiation",
  "copycat_positioning",
  "vague_claim",
  "predictable_naming",
] as const;
export const IssueKindSchema = z.enum(ISSUE_KINDS);
export type IssueKind = z.infer<typeof IssueKindSchema>;

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  buzzword: "Buzzword",
  empty_claim: "Empty claim",
  cliche: "Cliché",
  weak_differentiation: "Weak differentiation",
  copycat_positioning: "Copycat positioning",
  vague_claim: "Vague claim",
  predictable_naming: "Predictable naming",
};

export const CriticIssueSchema = z.object({
  kind: IssueKindSchema,
  /** The exact words that provoked it, so the UI can point at them. */
  evidence: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  /** One sentence on why this weakens the line. */
  note: z.string(),
});
export type CriticIssue = z.infer<typeof CriticIssueSchema>;

/** The subset of §13.5's rubric the revision loop actually acts on. */
export const GenericScoresSchema = z.object({
  genericity_risk: z.number(),
  distinctiveness: z.number(),
  audience_fit: z.number(),
  specificity: z.number(),
});
export type GenericScores = z.infer<typeof GenericScoresSchema>;

export const SCORE_LABELS: Record<keyof GenericScores, string> = {
  genericity_risk: "Genericity risk",
  distinctiveness: "Distinctiveness",
  audience_fit: "Audience fit",
  specificity: "Specificity",
};

export const CriticFindingSchema = z.object({
  /** Dotted Brand Context path, echoed back from the request. */
  target_path: z.string(),
  issues: z.array(CriticIssueSchema),
  scores: GenericScoresSchema,
  /** Directions a rewrite could take — not finished copy. */
  alternatives: z.array(z.string()),
  verdict: z.string(),
});
export type CriticFinding = z.infer<typeof CriticFindingSchema>;

export const AntiGenericCritiqueSchema = z.object({
  findings: z.array(CriticFindingSchema),
});
export type AntiGenericCritique = z.infer<typeof AntiGenericCritiqueSchema>;

export const RevisionSchema = z.object({
  target_path: z.string(),
  /** The rewritten line. Same job, same length range, sharper. */
  improved: z.string(),
  /** What changed and why, in one sentence, for the user. */
  reason: z.string(),
});
export type Revision = z.infer<typeof RevisionSchema>;

export const AntiGenericRevisionSchema = z.object({
  revisions: z.array(RevisionSchema),
});
export type AntiGenericRevision = z.infer<typeof AntiGenericRevisionSchema>;

/* ------------------------------------------------------------------ *
 * Stored state (our own shape, never sent to a model)
 * ------------------------------------------------------------------ */

export const LexiconHitSchema = z.object({
  kind: z.string(),
  match: z.string(),
  start: z.number(),
  end: z.number(),
  severity: z.enum(["low", "medium", "high"]),
  note: z.string(),
});

export const FieldChangeSchema = z.object({
  path: z.string(),
  label: z.string(),
  before: z.string(),
  after: z.string(),
  reason: z.string(),
});
export type FieldChange = z.infer<typeof FieldChangeSchema>;

export const RoundSchema = z.object({
  round: z.number().int().positive(),
  /** Every field the critic looked at this round, with its verdict. */
  findings: z.array(CriticFindingSchema),
  /** Deterministic hits per field, keyed by path (N12). */
  lexicon: z.array(z.object({ path: z.string(), hits: z.array(LexiconHitSchema) })),
  /** Paths that crossed a threshold and were rewritten. */
  triggered_paths: z.array(z.string()),
  changes: z.array(FieldChangeSchema),
  /** Fields whose rewrite scored worse and was rolled back (ADR-029). */
  reverted: z.array(
    z.object({ path: z.string(), label: z.string(), kept: z.string(), discarded: z.string() }),
  ),
  /** Why the loop stopped, when it did. */
  stopped_because: z.string().nullable(),
});
export type Round = z.infer<typeof RoundSchema>;

export const AntiGenericFieldSchema = z.object({
  path: z.string(),
  label: z.string(),
  /** The text as it was when the engine first saw it. */
  original: z.string(),
  /** The best version so far. */
  current: z.string(),
  locked: z.boolean(),
  /** The text before the most recent rewrite, kept so a worse round can be undone (ADR-029). */
  previous: z.string().nullable(),
  /** The critic's composite quality for `previous`, or for `current` once it has been judged. */
  best_quality: z.number().nullable(),
});
export type AntiGenericField = z.infer<typeof AntiGenericFieldSchema>;

export const AntiGenericResultSchema = z.object({
  fields: z.array(AntiGenericFieldSchema),
  rounds: z.array(RoundSchema),
  /** True once the loop has stopped: nothing triggered, or the round cap. */
  complete: z.boolean(),
  /** Set once the user has applied the changes to the Brand Context. */
  applied: z.boolean(),
  run_id: z.string().nullable(),
});
export type AntiGenericResult = z.infer<typeof AntiGenericResultSchema>;

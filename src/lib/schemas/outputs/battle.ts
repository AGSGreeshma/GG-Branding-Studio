import { z } from "zod";

/*
 * Brand Battle Lite output schemas (plan §14.3 hackathon build, ADR-008).
 *
 * Two calls: generate (three directions, one per lens) and challenge (scores,
 * objections, clichés, recommendation). Kept as flat as the content allows and
 * free of unsupported JSON Schema keywords: OpenAI strict mode rejects
 * minItems/maxItems/minimum/maximum, so counts and ranges are clamped in code.
 */

export const BATTLE_LENSES = ["strategist", "creative_director", "audience_advocate"] as const;
export const BattleLensSchema = z.enum(BATTLE_LENSES);
export type BattleLens = z.infer<typeof BattleLensSchema>;

/** "merged" is produced by Combine; a revision keeps the original id. */
export const DIRECTION_IDS = ["a", "b", "c", "merged"] as const;
export const DirectionIdSchema = z.enum(DIRECTION_IDS);
export type DirectionId = z.infer<typeof DirectionIdSchema>;

export const LENS_LABELS: Record<BattleLens, string> = {
  strategist: "Strategist",
  creative_director: "Creative Director",
  audience_advocate: "Audience Advocate",
};

export const DirectionPositioningSchema = z.object({
  category: z.string(),
  statement: z.string(),
  differentiator: z.string(),
  value_proposition: z.string(),
});
export type DirectionPositioning = z.infer<typeof DirectionPositioningSchema>;

export const BattleDirectionSchema = z.object({
  id: DirectionIdSchema,
  lens: BattleLensSchema,
  name: z.string(),
  positioning: DirectionPositioningSchema,
  /** Who this direction aims at first. The divergence check compares these. */
  audience_focus: z.string(),
  /** 3–5 traits; clamped in code. */
  personality: z.array(z.string()),
  tagline_direction: z.string(),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  /** Why this lens argues for this direction (§11.3 "why"). */
  why_this_lens: z.string(),
});
export type BattleDirection = z.infer<typeof BattleDirectionSchema>;

export const BattleGenerateOutputSchema = z.object({
  directions: z.array(BattleDirectionSchema),
});
export type BattleGenerateOutput = z.infer<typeof BattleGenerateOutputSchema>;

/** Scores from §13.5, 1–10. genericity_risk is inverted: lower is better. */
export const BattleScoresSchema = z.object({
  audience_fit: z.number(),
  clarity: z.number(),
  distinctiveness: z.number(),
  specificity: z.number(),
  strategic_strength: z.number(),
  genericity_risk: z.number(),
});
export type BattleScores = z.infer<typeof BattleScoresSchema>;

export const SCORE_LABELS: Record<keyof BattleScores, string> = {
  audience_fit: "Audience fit",
  clarity: "Clarity",
  distinctiveness: "Distinctiveness",
  specificity: "Specificity",
  strategic_strength: "Strategic strength",
  genericity_risk: "Genericity risk",
};

export const ObjectionSchema = z.object({
  claim: z.string(),
  /** The words in the direction that provoked the objection. */
  evidence: z.string(),
});
export type Objection = z.infer<typeof ObjectionSchema>;

export const DirectionCritiqueSchema = z.object({
  direction_id: DirectionIdSchema,
  scores: BattleScoresSchema,
  objections: z.array(ObjectionSchema),
  /** Phrases the critic considers clichés or empty claims. */
  cliches: z.array(z.string()),
  verdict: z.string(),
});
export type DirectionCritique = z.infer<typeof DirectionCritiqueSchema>;

export const BattleCritiqueOutputSchema = z.object({
  critiques: z.array(DirectionCritiqueSchema),
  recommendation: z.object({
    direction_id: DirectionIdSchema,
    reason: z.string(),
  }),
});
export type BattleCritiqueOutput = z.infer<typeof BattleCritiqueOutputSchema>;

export const BattleMergeOutputSchema = z.object({
  direction: BattleDirectionSchema,
  /** What was taken from each side, shown under the merged card. */
  merge_note: z.string(),
});
export type BattleMergeOutput = z.infer<typeof BattleMergeOutputSchema>;

export const BattleReviseOutputSchema = z.object({
  direction: BattleDirectionSchema,
  change_note: z.string(),
});
export type BattleReviseOutput = z.infer<typeof BattleReviseOutputSchema>;

/** The stored result of one battle: what the workspace renders and reloads. */
export const BattleResultSchema = z.object({
  directions: z.array(BattleDirectionSchema),
  critique: BattleCritiqueOutputSchema.nullable(),
  /** Set when the directions collided and were regenerated once. */
  divergence_note: z.string().nullable(),
  run_id: z.string().nullable(),
});
export type BattleResult = z.infer<typeof BattleResultSchema>;

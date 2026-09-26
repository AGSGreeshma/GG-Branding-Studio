import { z } from "zod";
import { ColorSchema, TypographySchema } from "../brand-context";

/*
 * One Idea, Five Worlds (plan §14.5, M1–M10). Identity exploration after a
 * strategic direction is chosen — not a second Brand Battle.
 *
 * Strict-mode rules apply (CLAUDE.md, AI rule 2): every property required,
 * no optionals, no length or range keywords. Voice and visual fields are kept
 * flat rather than nested objects so the schema stays shallow.
 */

/** Three worlds to start (ADR-008); "Explore 2 more" adds w4 and w5. */
export const WORLD_IDS = ["w1", "w2", "w3", "w4", "w5", "merged"] as const;
export const WorldIdSchema = z.enum(WORLD_IDS);
export type WorldId = z.infer<typeof WorldIdSchema>;

export const SampleNameSchema = z.object({
  name: z.string(),
  rationale: z.string(),
});
export type SampleName = z.infer<typeof SampleNameSchema>;

export const WorldSchema = z.object({
  id: WorldIdSchema,
  /** What this identity world is called, e.g. "The Workshop". */
  name: z.string(),
  /** One line on how this world feels, for the card header. */
  summary: z.string(),
  /** 3–5 adjectives; clamped in code. */
  personality: z.array(z.string()),

  naming_direction: z.string(),
  /** 2–3 sample names with a reason each. Availability is never claimed (rule 12). */
  sample_names: z.array(SampleNameSchema),
  tagline_direction: z.string(),

  /** 3 rules; clamped in code. */
  voice_rules: z.array(z.string()),
  /** One sentence written in this world's voice, shown on the card. */
  voice_sample_line: z.string(),

  /** Hex validity and WCAG contrast are checked in code (§14.8, T3). */
  colors: z.array(ColorSchema),
  /** Families must come from the free-font allowlist (§14.8, T2). */
  typography: z.array(TypographySchema),
  imagery: z.array(z.string()),
  composition: z.array(z.string()),

  audience_perception: z.string(),
  risks: z.array(z.string()),
  opportunities: z.array(z.string()),
  /** The predictable identities this world deliberately avoids (ADR-026). */
  obvious_ideas_rejected: z.array(z.string()),
});
export type World = z.infer<typeof WorldSchema>;

export const WorldsGenerateOutputSchema = z.object({
  worlds: z.array(WorldSchema),
});
export type WorldsGenerateOutput = z.infer<typeof WorldsGenerateOutputSchema>;

export const WorldMergeOutputSchema = z.object({
  world: WorldSchema,
  merge_note: z.string(),
});
export type WorldMergeOutput = z.infer<typeof WorldMergeOutputSchema>;

export const WorldReviseOutputSchema = z.object({
  world: WorldSchema,
  change_note: z.string(),
});
export type WorldReviseOutput = z.infer<typeof WorldReviseOutputSchema>;

/* ------------------------------------------------------------------ *
 * Stored state (our own shape, never sent to a model)
 * ------------------------------------------------------------------ */

export const VisualIssueSchema = z.object({
  kind: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string(),
});
export type VisualIssue = z.infer<typeof VisualIssueSchema>;

/** Deterministic check results per world, computed server-side (§14.8). */
export const WorldChecksSchema = z.object({
  world_id: WorldIdSchema,
  issues: z.array(VisualIssueSchema),
  /** The contrast pair the check found, for the card's accessibility note. */
  contrast: z
    .object({ ratio: z.number(), level: z.string(), text: z.string(), background: z.string() })
    .nullable(),
  /** Allowlisted families to load for the specimen. */
  font_families: z.array(z.string()),
});
export type WorldChecks = z.infer<typeof WorldChecksSchema>;

export const WorldsResultSchema = z.object({
  worlds: z.array(WorldSchema),
  checks: z.array(WorldChecksSchema),
  /** Set by a merge or a revision, shown under the affected card. */
  note: z.string().nullable(),
  run_id: z.string().nullable(),
});
export type WorldsResult = z.infer<typeof WorldsResultSchema>;

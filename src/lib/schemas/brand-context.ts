import { z } from "zod";
import { EntryStageSchema, ModuleNameSchema, type EntryStage } from "./workflow";

/*
 * Shared Brand Context (plan §12). Canonical for server, client and AI calls.
 *
 * OpenAI strict structured outputs: every property is required, "maybe" values
 * use .nullable() (never .optional() or .default()), and there are no open
 * records. That is why `meta.confidence` and `provenance` are arrays of
 * { path, ... } entries rather than maps keyed by field path (ADR-009).
 */

const StringList = z.array(z.string());

export const CandidateNameSchema = z.object({
  name: z.string(),
  territory: z.string(),
  rationale: z.string(),
  risks: StringList,
});
export type CandidateName = z.infer<typeof CandidateNameSchema>;

export const ColorSchema = z.object({
  name: z.string(),
  /** "#RRGGBB". Format and contrast are checked deterministically in code (T3), not by the schema. */
  hex: z.string(),
  role: z.string(),
});
export type BrandColor = z.infer<typeof ColorSchema>;

export const TypographySchema = z.object({
  role: z.string(),
  family: z.string(),
  rationale: z.string(),
});
export type BrandTypography = z.infer<typeof TypographySchema>;

export const SocialPostSchema = z.object({
  platform: z.string(),
  text: z.string(),
});
export type SocialPost = z.infer<typeof SocialPostSchema>;

export const SelectedDirectionSchema = z.object({
  name: z.string(),
  source_module: ModuleNameSchema,
  summary: z.string(),
  run_id: z.string().nullable(),
});
export type SelectedDirection = z.infer<typeof SelectedDirectionSchema>;

export const ConfidenceLevelSchema = z.enum(["low", "medium", "high"]);

export const ConfidenceEntrySchema = z.object({
  /** Dotted Brand Context path, e.g. "audience.primary". */
  path: z.string(),
  level: ConfidenceLevelSchema,
});
export type ConfidenceEntry = z.infer<typeof ConfidenceEntrySchema>;

export const ProvenanceEntrySchema = z.object({
  path: z.string(),
  source: z.enum(["user", "agent"]),
  agent: z.string().nullable(),
  run_id: z.string().nullable(),
  decision_id: z.string().nullable(),
  derived_from: StringList,
});
export type ProvenanceEntry = z.infer<typeof ProvenanceEntrySchema>;

export const BrandContextSchema = z.object({
  project: z.object({
    name: z.string(),
    description: z.string(),
    stage: EntryStageSchema.nullable(),
  }),
  problem: z.object({
    statement: z.string(),
    importance: z.string(),
    existing_alternatives: StringList,
  }),
  audience: z.object({
    primary: StringList,
    secondary: StringList,
    needs: StringList,
    pain_points: StringList,
    behaviors: StringList,
  }),
  product: z.object({
    description: z.string(),
    features: StringList,
    benefits: StringList,
  }),
  positioning: z.object({
    category: z.string(),
    statement: z.string(),
    differentiator: z.string(),
    competitive_angle: z.string(),
    value_proposition: z.string(),
  }),
  personality: z.object({
    traits: StringList,
    principles: StringList,
    traits_to_avoid: StringList,
  }),
  identity: z.object({
    name: z.string(),
    naming_direction: z.string(),
    naming_territories: StringList,
    candidate_names: z.array(CandidateNameSchema),
    tagline: z.string(),
  }),
  messaging: z.object({
    one_line_pitch: z.string(),
    elevator_pitch: z.string(),
    key_messages: StringList,
  }),
  voice: z.object({
    tone: StringList,
    rules: StringList,
    examples: StringList,
  }),
  visual: z.object({
    colors: z.array(ColorSchema),
    typography: z.array(TypographySchema),
    imagery: StringList,
    composition: StringList,
    shapes: StringList,
    symbols: StringList,
    things_to_avoid: StringList,
  }),
  brand_rules: StringList,
  selected_direction: SelectedDirectionSchema.nullable(),
  launch: z.object({
    headline: z.string(),
    subheadline: z.string(),
    cta: z.string(),
    social_posts: z.array(SocialPostSchema),
    announcement: z.string(),
    product_description: z.string(),
  }),
  meta: z.object({
    assumptions: StringList,
    open_questions: StringList,
    confidence: z.array(ConfidenceEntrySchema),
  }),
  provenance: z.array(ProvenanceEntrySchema),
});

export type BrandContext = z.infer<typeof BrandContextSchema>;

/** Top-level sections, useful for slicing context per agent (F8, context-manager). */
export const BRAND_CONTEXT_SECTIONS = Object.keys(BrandContextSchema.shape) as Array<
  keyof BrandContext
>;

export function emptyBrandContext(
  init: { name?: string; description?: string; stage?: EntryStage | null } = {},
): BrandContext {
  return {
    project: {
      name: init.name ?? "",
      description: init.description ?? "",
      stage: init.stage ?? null,
    },
    problem: { statement: "", importance: "", existing_alternatives: [] },
    audience: { primary: [], secondary: [], needs: [], pain_points: [], behaviors: [] },
    product: { description: "", features: [], benefits: [] },
    positioning: {
      category: "",
      statement: "",
      differentiator: "",
      competitive_angle: "",
      value_proposition: "",
    },
    personality: { traits: [], principles: [], traits_to_avoid: [] },
    identity: {
      name: "",
      naming_direction: "",
      naming_territories: [],
      candidate_names: [],
      tagline: "",
    },
    messaging: { one_line_pitch: "", elevator_pitch: "", key_messages: [] },
    voice: { tone: [], rules: [], examples: [] },
    visual: {
      colors: [],
      typography: [],
      imagery: [],
      composition: [],
      shapes: [],
      symbols: [],
      things_to_avoid: [],
    },
    brand_rules: [],
    selected_direction: null,
    launch: {
      headline: "",
      subheadline: "",
      cta: "",
      social_posts: [],
      announcement: "",
      product_description: "",
    },
    meta: { assumptions: [], open_questions: [], confidence: [] },
    provenance: [],
  };
}

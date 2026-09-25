import { z } from "zod";
import { ConfidenceEntrySchema } from "../brand-context";

/*
 * Brand Interviewer output (plan §14.1, agent contract §13.1).
 *
 * OpenAI strict structured outputs: every property is required, "maybe" values
 * are .nullable() (never .optional()), enums are small and nesting is shallow
 * (CLAUDE.md, AI rule 2). Counts ("2–4 suggested answers") are clamped in code,
 * not with minItems, because strict mode ignores array length keywords.
 */

/**
 * Brand Context paths the Interviewer is allowed to write (H3).
 * Anything outside this list is a later module's job, so the enum is the
 * schema-level guard and the applier is the code-level guard.
 */
export const INTERVIEW_UPDATE_PATHS = [
  "project.name",
  "project.description",
  "problem.statement",
  "problem.importance",
  "problem.existing_alternatives",
  "audience.primary",
  "audience.secondary",
  "audience.needs",
  "audience.pain_points",
  "audience.behaviors",
  "product.description",
  "product.features",
  "product.benefits",
] as const;
export const InterviewUpdatePathSchema = z.enum(INTERVIEW_UPDATE_PATHS);
export type InterviewUpdatePath = z.infer<typeof InterviewUpdatePathSchema>;

export const ExtractedUpdateSchema = z.object({
  path: InterviewUpdatePathSchema,
  /**
   * For text fields the first entry is used; for list fields every entry is.
   * One shape keeps the schema strict-mode friendly (no unions).
   */
  values: z.array(z.string()),
  /** The words from the user's answer this update is based on. Never invented. */
  evidence: z.string(),
});
export type ExtractedUpdate = z.infer<typeof ExtractedUpdateSchema>;

export const InterviewerOutputSchema = z.object({
  /** Non-null only when the idea is clearly illegal or harmful: a polite decline instead of a question (H11). */
  refusal: z.string().nullable(),
  known_information: z.array(z.string()),
  missing_information: z.array(z.string()),
  assumptions: z.array(z.string()),
  next_question: z.string(),
  /** Shown as "why I'm asking" under the question (plan §14.1). */
  question_reason: z.string(),
  /** 2–4 short, tappable options. Clamped in code. */
  suggested_answers: z.array(z.string()),
  /** Per-field confidence in the ADR-009 array format. */
  confidence: z.array(ConfidenceEntrySchema),
  extracted_updates: z.array(ExtractedUpdateSchema),
});
export type InterviewerOutput = z.infer<typeof InterviewerOutputSchema>;

import { z } from "zod";
import { BrandContextSchema } from "./brand-context";
import { WorkflowPlanSchema } from "./workflow";

/*
 * Interview API contract (plan §14.1, §18.3). Client-safe: no server imports.
 * The AI output schema lives in schemas/outputs/interviewer.ts.
 */

export const INTERVIEW_ROLES = ["assistant", "user"] as const;
export const InterviewRoleSchema = z.enum(INTERVIEW_ROLES);
export type InterviewRole = z.infer<typeof InterviewRoleSchema>;

/** One stored turn as the client sees it. */
export const InterviewTurnSchema = z.object({
  id: z.string(),
  role: InterviewRoleSchema,
  content: z.string(),
  /** "Why I'm asking", assistant turns only. */
  question_reason: z.string().nullable(),
  suggested_answers: z.array(z.string()),
  created_at: z.string(),
});
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;

/**
 * Body of POST /api/projects/[id]/interview.
 * No body at all starts the interview; `answer` is one user reply;
 * `skip` is the "That's enough, continue" button (plan §7.4).
 */
export const InterviewRequestSchema = z.object({
  answer: z.string().trim().max(4000).optional(),
  skip: z.boolean().optional(),
});
export type InterviewRequest = z.infer<typeof InterviewRequestSchema>;

/** Why the interview ended, for the sidebar and the run trace (plan §7.4). */
export const COMPLETION_REASONS = ["confidence", "question_limit", "user_skipped"] as const;
export const CompletionReasonSchema = z.enum(COMPLETION_REASONS);
export type CompletionReason = z.infer<typeof CompletionReasonSchema>;

export const InterviewResponseSchema = z.object({
  /** The new assistant question, or null when the interview just completed. */
  turn: InterviewTurnSchema.nullable(),
  /** The user's answer as stored, so the client can replace its optimistic copy. */
  user_turn: InterviewTurnSchema.nullable(),
  context: BrandContextSchema,
  version: z.number().int().positive(),
  complete: z.boolean(),
  completion_reason: CompletionReasonSchema.nullable(),
  questions_asked: z.number().int().nonnegative(),
  plan: WorkflowPlanSchema,
  /** Set when the idea was declined on content-policy grounds (H11). */
  declined: z.boolean(),
});
export type InterviewResponse = z.infer<typeof InterviewResponseSchema>;

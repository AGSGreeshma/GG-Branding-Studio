import type { BrandContext, ConfidenceEntry } from "@/lib/schemas/brand-context";
import type { CompletionReason } from "@/lib/schemas/interview";
import { TRACKED_CONFIDENCE_PATHS } from "./context-manager";

/*
 * Interview completion rule (plan §7.4). Decided in code, never by the model:
 * the model reports confidence, this function decides when the interview ends.
 */

/** Maximum questions before the interview ends regardless of confidence. */
export const MAX_INTERVIEW_QUESTIONS = 6;

/** §7.4 is written as "confidence >= 0.7"; ADR-009 stores levels, so levels map to scores. */
export const CONFIDENCE_SCORE: Record<ConfidenceEntry["level"], number> = {
  low: 0.2,
  medium: 0.5,
  high: 0.9,
};

export const CONFIDENCE_THRESHOLD = 0.7;

export function confidenceScore(context: BrandContext, path: string): number {
  const entry = context.meta.confidence.find((item) => item.path === path);
  return entry ? CONFIDENCE_SCORE[entry.level] : 0;
}

/** True when problem, primary audience and product description are all understood well enough. */
export function hasEnoughConfidence(context: BrandContext): boolean {
  return TRACKED_CONFIDENCE_PATHS.every(
    (path) => confidenceScore(context, path) >= CONFIDENCE_THRESHOLD,
  );
}

export interface CompletionInput {
  context: BrandContext;
  /** Questions the Interviewer has already asked in this project. */
  questionsAsked: number;
  /** The user pressed "That's enough, continue". */
  skipRequested: boolean;
}

export interface CompletionDecision {
  complete: boolean;
  reason: CompletionReason | null;
}

export function decideCompletion(input: CompletionInput): CompletionDecision {
  if (input.skipRequested) return { complete: true, reason: "user_skipped" };
  if (hasEnoughConfidence(input.context)) return { complete: true, reason: "confidence" };
  if (input.questionsAsked >= MAX_INTERVIEW_QUESTIONS) {
    return { complete: true, reason: "question_limit" };
  }
  return { complete: false, reason: null };
}

/** Human-readable completion note for the workspace and the sidebar. */
export const COMPLETION_MESSAGE: Record<CompletionReason, string> = {
  confidence: "I understand your problem, your audience and your product well enough to move on.",
  question_limit:
    "That's enough questions. Anything still unclear is carried forward as an assumption you can correct.",
  user_skipped: "Got it — we'll work with what you've told me so far.",
};

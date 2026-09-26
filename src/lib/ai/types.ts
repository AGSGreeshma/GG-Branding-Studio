import type { ErrorCode } from "@/lib/schemas/errors";

/** Model tier: `primary` for generation and synthesis, `fast` for critics and short turns (plan §20.2). */
export type ModelTier = "primary" | "fast";

/**
 * How hard a reasoning model should think before answering. Only the values the
 * hackathon uses; the provider supports more (plan §20.2, ADR-017).
 */
export type ReasoningEffort = "none" | "low" | "medium";

/**
 * Whether to ask a reasoning model for a summary of its thinking.
 * `off` is the default: the summary costs output tokens and latency, and
 * nothing in the product reads it (ADR-024).
 */
export type ReasoningSummary = "off" | "auto" | "detailed";

/**
 * One model call as recorded in `workflow_runs` (CLAUDE.md, AI rule 10).
 * llm.ts returns it; callers persist it with recordRun so agents stay pure.
 */
export interface LlmTrace {
  agent: string;
  model: string;
  promptVersion: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  /** Extra attempts beyond the first: repair retries plus provider backoff retries. */
  retryCount: number;
  errorCode: ErrorCode | null;
}

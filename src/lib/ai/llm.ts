import "server-only";
import { openai } from "@ai-sdk/openai";
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  TypeValidationError,
  type JSONValue,
  type LanguageModelUsage,
} from "ai";
import { z } from "zod";
import { AppError, type ErrorCode } from "@/lib/schemas/errors";
import { describeError, logEvent } from "@/lib/services/log";
import type { LlmTrace, ModelTier, ReasoningEffort, ReasoningSummary } from "./types";

/*
 * The ONLY place that calls OpenAI (CLAUDE.md). Structured output via AI SDK 7
 * `generateText` + `Output.object` (generateObject is deprecated in v7, ADR-011).
 *
 * Reliability rules (plan §18.5, F2–F7):
 * - Output is re-validated with Zod after every call.
 * - Invalid output: ONE repair retry with the validation errors appended to the prompt.
 * - 429 / 5xx / network errors: up to 2 retries with exponential backoff.
 * - Each attempt has a per-tier timeout. A timeout is not retried: a second
 *   attempt would outlive the route's maxDuration.
 * - No DB writes here. The trace is returned (or attached to the thrown error)
 *   and callers persist it with recordRun, so agents stay pure.
 */

export const TIER_TIMEOUT_MS: Record<ModelTier, number> = { fast: 30_000, primary: 60_000 };
const MAX_REPAIR_RETRIES = 1;
const MAX_PROVIDER_RETRIES = 2;
const BACKOFF_BASE_MS = 500;
const MAX_BACKOFF_MS = 8_000;
const MAX_ISSUES_IN_REPAIR = 20;

/**
 * Reasoning effort for reasoning models (o-series, gpt-5 and later). Ignored by
 * the provider on non-reasoning models such as the gpt-4.1 family, so it is
 * always safe to send. `none` is only accepted by some models (e.g. gpt-6-sol);
 * the provider warns and drops it elsewhere rather than failing the call.
 */
export function reasoningEffortForTier(tier: ModelTier): ReasoningEffort | null {
  const raw = process.env[tier === "primary" ? "MODEL_PRIMARY_REASONING_EFFORT" : "MODEL_FAST_REASONING_EFFORT"];
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "none" || value === "low" || value === "medium") return value;
  logEvent("warn", "llm.bad_reasoning_effort", { tier, value });
  return null;
}

/**
 * Reasoning summaries are off unless `OPENAI_REASONING_SUMMARY` asks for one.
 * The provider otherwise defaults to a `detailed` summary whenever a reasoning
 * effort is set, which we pay for in output tokens and never read (ADR-024).
 */
export function reasoningSummarySetting(): ReasoningSummary {
  const raw = process.env.OPENAI_REASONING_SUMMARY?.trim().toLowerCase();
  if (!raw || raw === "off") return "off";
  if (raw === "auto" || raw === "detailed") return raw;
  logEvent("warn", "llm.bad_reasoning_summary", { value: raw });
  return "off";
}

/** The `providerOptions.openai` block, or undefined when there is nothing to say. */
export function buildProviderOptions(
  effort: ReasoningEffort | null,
  summary: ReasoningSummary,
): { openai: Record<string, JSONValue> } | undefined {
  const openai: Record<string, JSONValue> = {};
  if (effort) openai.reasoningEffort = effort;
  if (summary === "off") {
    // Explicit null overrides the provider's "detailed" default; only needed
    // when an effort is set, since otherwise it asks for no summary anyway.
    if (effort) openai.reasoningSummary = null;
  } else {
    openai.reasoningSummary = summary;
  }
  return Object.keys(openai).length > 0 ? { openai } : undefined;
}

export interface GenerateStructuredOptions<S extends z.ZodType> {
  /** Agent name, e.g. "interviewer". Used in traces and logs. */
  agent: string;
  schema: S;
  /** JSON schema name sent to OpenAI. Defaults to the agent name. */
  schemaName?: string;
  system: string;
  prompt: string;
  tier: ModelTier;
  temperature?: number;
  maxTokens?: number;
  promptVersion: string;
  /**
   * Per-call override of the tier's reasoning effort, e.g. "none" for the
   * interviewer's short turns. `null` means "use the tier default".
   */
  reasoningEffort?: ReasoningEffort | null;
}

export interface GenerateStructuredResult<T> {
  result: T;
  trace: LlmTrace;
}

/** Typed AI failure that still carries the trace, so callers can log failed runs too. */
export class AiCallError extends AppError {
  readonly trace: LlmTrace;
  constructor(code: ErrorCode, trace: LlmTrace, options: { message: string; cause?: unknown; retryable?: boolean }) {
    super(code, options);
    this.name = "AiCallError";
    this.trace = trace;
  }
}

export function modelIdForTier(tier: ModelTier): string {
  const envName = tier === "primary" ? "MODEL_PRIMARY" : "MODEL_FAST";
  const modelId = process.env[envName];
  if (!modelId) {
    throw new AppError("AI_PROVIDER_UNAVAILABLE", {
      message: `${envName} is not set`,
      retryable: false,
    });
  }
  return modelId;
}

export function temperatureAllowed(): boolean {
  return process.env.OPENAI_OMIT_TEMPERATURE !== "1";
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/** Human-readable reasons the model output was rejected. These describe model output, not user input. */
function describeInvalidOutput(err: NoObjectGeneratedError): string[] {
  const cause = err.cause;
  if (TypeValidationError.isInstance(cause) && cause.cause instanceof z.ZodError) {
    return formatZodIssues(cause.cause);
  }
  if (cause instanceof z.ZodError) return formatZodIssues(cause);
  if (err.finishReason === "length") {
    return ["The response was cut off before the JSON was complete. Be more concise."];
  }
  return [cause instanceof Error ? cause.message.slice(0, 300) : err.message.slice(0, 300)];
}

function buildRepairPrompt(originalPrompt: string, issues: string[]): string {
  const listed = issues
    .slice(0, MAX_ISSUES_IN_REPAIR)
    .map((issue) => `- ${issue}`)
    .join("\n");
  return [
    originalPrompt,
    "",
    "<validation_errors>",
    listed,
    "</validation_errors>",
    "Your previous response did not match the required JSON schema.",
    "Fix every problem listed above and return only a JSON object that matches the schema exactly.",
  ].join("\n");
}

/**
 * A 429 can mean "slow down" or "this account is out of credit". Only the first
 * is worth retrying; the second would burn the route's whole maxDuration before
 * failing anyway, so it is reported immediately as a provider problem.
 */
function isQuotaExhausted(err: APICallError): boolean {
  if (err.statusCode !== 429) return false;
  const body = typeof err.responseBody === "string" ? err.responseBody.toLowerCase() : "";
  return (
    body.includes("insufficient_quota") ||
    body.includes("billing_hard_limit_reached") ||
    body.includes("no credits remaining") ||
    body.includes("exceeded your current quota")
  );
}

function isRetryableProviderError(err: unknown): err is APICallError {
  if (!APICallError.isInstance(err)) return false;
  if (isQuotaExhausted(err)) return false;
  const status = err.statusCode;
  return status === 429 || (status !== undefined && status >= 500) || status === undefined || err.isRetryable;
}

function retryAfterMs(err: APICallError): number | null {
  const headers = err.responseHeaders ?? {};
  const ms = Number(headers["retry-after-ms"]);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const seconds = Number(headers["retry-after"]);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return null;
}

function backoffMs(attempt: number, err: APICallError): number {
  const exponential = BACKOFF_BASE_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
  return Math.min(Math.max(exponential, retryAfterMs(err) ?? 0), MAX_BACKOFF_MS);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls the tier's model and returns output validated against `schema`,
 * plus a trace for workflow_runs. Throws AiCallError (an AppError) with
 * AI_OUTPUT_INVALID, AI_PROVIDER_UNAVAILABLE, AI_TIMEOUT or RATE_LIMITED.
 */
export async function generateStructured<S extends z.ZodType>(
  options: GenerateStructuredOptions<S>,
): Promise<GenerateStructuredResult<z.output<S>>> {
  const { agent, schema, system, prompt, tier, temperature, maxTokens, promptVersion } = options;
  const modelId = modelIdForTier(tier);
  const schemaName = (options.schemaName ?? agent).replace(/[^a-zA-Z0-9_-]/g, "_");
  const sendTemperature = temperature !== undefined && temperatureAllowed();
  const effort = options.reasoningEffort ?? reasoningEffortForTier(tier);
  const providerOptions = buildProviderOptions(effort, reasoningSummarySetting());

  const startedAt = Date.now();
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let repairRetries = 0;
  let providerRetries = 0;
  let currentPrompt = prompt;

  const addUsage = (usage: LanguageModelUsage | undefined) => {
    if (!usage) return;
    if (usage.inputTokens !== undefined) tokensIn = (tokensIn ?? 0) + usage.inputTokens;
    if (usage.outputTokens !== undefined) tokensOut = (tokensOut ?? 0) + usage.outputTokens;
  };

  const trace = (errorCode: ErrorCode | null): LlmTrace => ({
    agent,
    model: modelId,
    promptVersion,
    tokensIn,
    tokensOut,
    latencyMs: Date.now() - startedAt,
    retryCount: repairRetries + providerRetries,
    errorCode,
  });

  const fail = (
    code: ErrorCode,
    message: string,
    cause?: unknown,
    retryable?: boolean,
  ): AiCallError => {
    const t = trace(code);
    logEvent("error", "llm.call_failed", {
      agent,
      model: modelId,
      prompt_version: promptVersion,
      error_code: code,
      latency_ms: t.latencyMs,
      retry_count: t.retryCount,
      ...describeError(cause),
    });
    return new AiCallError(code, t, { message, cause, retryable });
  };

  for (;;) {
    const signal = AbortSignal.timeout(TIER_TIMEOUT_MS[tier]);
    let issues: string[];

    try {
      const response = await generateText({
        model: openai(modelId),
        system,
        prompt: currentPrompt,
        output: Output.object({ schema, name: schemaName }),
        maxRetries: 0, // retries are handled here so retryCount is accurate
        abortSignal: signal,
        ...(maxTokens !== undefined ? { maxOutputTokens: maxTokens } : {}),
        ...(sendTemperature ? { temperature } : {}),
        ...(providerOptions ? { providerOptions } : {}),
      });
      addUsage(response.usage);

      const parsed = schema.safeParse(response.output);
      if (parsed.success) {
        const t = trace(null);
        logEvent("info", "llm.call_succeeded", {
          agent,
          model: modelId,
          prompt_version: promptVersion,
          latency_ms: t.latencyMs,
          retry_count: t.retryCount,
          tokens_in: t.tokensIn,
          tokens_out: t.tokensOut,
        });
        return { result: parsed.data, trace: t };
      }
      issues = formatZodIssues(parsed.error);
    } catch (err) {
      if (signal.aborted) {
        throw fail("AI_TIMEOUT", `${agent} timed out after ${TIER_TIMEOUT_MS[tier]}ms`, err);
      }
      if (NoObjectGeneratedError.isInstance(err)) {
        addUsage(err.usage);
        issues = describeInvalidOutput(err);
      } else if (NoOutputGeneratedError.isInstance(err)) {
        issues = ["The response was empty. Return a JSON object that matches the schema."];
      } else if (isRetryableProviderError(err)) {
        if (providerRetries < MAX_PROVIDER_RETRIES) {
          providerRetries++;
          await sleep(backoffMs(providerRetries, err));
          continue;
        }
        if (err.statusCode === 429) {
          throw fail("RATE_LIMITED", `${agent}: provider rate limit after retries`, err);
        }
        throw fail("AI_PROVIDER_UNAVAILABLE", `${agent}: provider error after retries`, err);
      } else if (APICallError.isInstance(err) && isQuotaExhausted(err)) {
        throw fail(
          "AI_PROVIDER_UNAVAILABLE",
          `${agent}: the OpenAI account has no remaining quota`,
          err,
          false,
        );
      } else if (err instanceof AppError) {
        throw err;
      } else {
        // 4xx (bad key, unknown model, rejected schema) or an unexpected SDK error: not worth retrying.
        throw fail("AI_PROVIDER_UNAVAILABLE", `${agent}: non-retryable provider error`, err, false);
      }
    }

    if (repairRetries >= MAX_REPAIR_RETRIES) {
      throw fail("AI_OUTPUT_INVALID", `${agent}: output failed validation after repair retry: ${issues.slice(0, 5).join("; ")}`);
    }
    repairRetries++;
    logEvent("warn", "llm.repair_retry", { agent, model: modelId, issue_count: issues.length });
    currentPrompt = buildRepairPrompt(prompt, issues);
  }
}

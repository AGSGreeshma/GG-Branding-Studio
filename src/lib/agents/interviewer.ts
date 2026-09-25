import "server-only";
import { generateStructured } from "@/lib/ai/llm";
import type { LlmTrace } from "@/lib/ai/types";
import * as prompt from "@/lib/prompts/interviewer";
import type { InterviewTurn } from "@/lib/schemas/interview";
import type { InterviewerOutput } from "@/lib/schemas/outputs/interviewer";
import type { BrandContext } from "@/lib/schemas/brand-context";
import type { EntryStage } from "@/lib/schemas/workflow";
import { sliceForInterviewer } from "@/lib/services/context-manager";
import { MAX_INTERVIEW_QUESTIONS } from "@/lib/services/interview";

/*
 * Brand Interviewer agent (plan §14.1, H1–H5).
 * Pure: (context slice, recent turns) -> validated output. No DB access; the
 * route persists the turn, the context and the trace (CLAUDE.md, AI rule 4).
 */

export interface InterviewerInput {
  entryStage: EntryStage;
  context: BrandContext;
  /** Full turn history; only the most recent are sent to the model. */
  turns: InterviewTurn[];
  questionsAsked: number;
  lockedPaths: readonly string[];
}

export interface InterviewerResult {
  output: InterviewerOutput;
  trace: LlmTrace;
}

const MIN_SUGGESTED_ANSWERS = 2;
const MAX_SUGGESTED_ANSWERS = 4;

/** Keeps the chips to 2–4 distinct, non-empty options (the schema cannot enforce counts). */
function normaliseSuggestions(values: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
    if (cleaned.length === MAX_SUGGESTED_ANSWERS) break;
  }
  // Fewer than two chips is not worth showing; the free-text box is always there.
  return cleaned.length >= MIN_SUGGESTED_ANSWERS ? cleaned : [];
}

export async function runInterviewer(input: InterviewerInput): Promise<InterviewerResult> {
  const recentTurns = input.turns.slice(-prompt.RECENT_TURN_LIMIT);

  const { result, trace } = await generateStructured({
    agent: prompt.meta.agent,
    schema: prompt.meta.schema,
    system: prompt.system,
    prompt: prompt.buildUser({
      entryStage: input.entryStage,
      slice: sliceForInterviewer(input.context),
      recentTurns,
      questionsAsked: input.questionsAsked,
      questionsRemaining: Math.max(0, MAX_INTERVIEW_QUESTIONS - input.questionsAsked),
      lockedPaths: [...input.lockedPaths],
    }),
    tier: prompt.meta.tier,
    temperature: prompt.meta.temperature,
    maxTokens: prompt.meta.maxTokens,
    promptVersion: prompt.PROMPT_VERSION,
  });

  const refusal = result.refusal?.trim() ? result.refusal.trim() : null;

  return {
    // A decline carries no question and no extracted facts, whatever the model returned.
    output: refusal
      ? {
          ...result,
          refusal,
          next_question: "",
          question_reason: "",
          suggested_answers: [],
          extracted_updates: [],
          confidence: [],
        }
      : {
          ...result,
          refusal: null,
          next_question: result.next_question.trim(),
          suggested_answers: normaliseSuggestions(result.suggested_answers),
        },
    trace,
  };
}

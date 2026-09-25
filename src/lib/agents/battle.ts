import "server-only";
import { generateStructured } from "@/lib/ai/llm";
import type { LlmTrace } from "@/lib/ai/types";
import * as prompt from "@/lib/prompts/battle";
import {
  BATTLE_LENSES,
  type BattleCritiqueOutput,
  type BattleDirection,
  type BattleScores,
} from "@/lib/schemas/outputs/battle";

/*
 * Brand Battle Lite agents (plan §14.3, K1–K8 in their two-call form).
 * Pure: (slice, ctx) -> validated output. The route persists runs and context.
 *
 * Everything the schema cannot express — counts, score ranges, the divergence
 * rule — is enforced here in code (CLAUDE.md, AI rule 9).
 */

const MIN_TRAITS = 3;
const MAX_TRAITS = 5;
const MAX_LIST = 3;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.round(value)));
}

function clampScores(scores: BattleScores): BattleScores {
  return {
    audience_fit: clampScore(scores.audience_fit),
    clarity: clampScore(scores.clarity),
    distinctiveness: clampScore(scores.distinctiveness),
    specificity: clampScore(scores.specificity),
    strategic_strength: clampScore(scores.strategic_strength),
    genericity_risk: clampScore(scores.genericity_risk),
  };
}

function cleanList(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
    if (out.length === max) break;
  }
  return out;
}

function normaliseDirection(direction: BattleDirection): BattleDirection {
  return {
    ...direction,
    name: direction.name.trim(),
    audience_focus: direction.audience_focus.trim(),
    personality: cleanList(direction.personality, MAX_TRAITS),
    strengths: cleanList(direction.strengths, MAX_LIST),
    risks: cleanList(direction.risks, MAX_LIST),
  };
}

/** Comparable form of a free-text field: case, punctuation and filler removed. */
function normaliseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|for|of|and|to|who|that|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DivergenceResult {
  ok: boolean;
  /** The two ids that collided, when they did. */
  collision: [string, string] | null;
  message: string | null;
}

/**
 * Divergence check (plan §14.3): the three directions must differ in audience
 * focus or category. Two directions collide only when both match, which is the
 * case where the battle has really produced one idea three times.
 */
export function checkDivergence(directions: BattleDirection[]): DivergenceResult {
  for (let i = 0; i < directions.length; i++) {
    for (let j = i + 1; j < directions.length; j++) {
      const a = directions[i]!;
      const b = directions[j]!;
      const sameAudience = normaliseText(a.audience_focus) === normaliseText(b.audience_focus);
      const sameCategory =
        normaliseText(a.positioning.category) === normaliseText(b.positioning.category);
      if (sameAudience && sameCategory) {
        return {
          ok: false,
          collision: [a.id, b.id],
          message: `Directions ${a.id.toUpperCase()} and ${b.id.toUpperCase()} aimed at the same audience in the same category.`,
        };
      }
    }
  }
  return { ok: true, collision: null, message: null };
}

export interface GenerateResult {
  directions: BattleDirection[];
  trace: LlmTrace;
}

/** One call: three directions, one per lens (§14.3 hackathon build, call 1). */
export async function runBattleGenerate(
  slice: prompt.BattleSlice,
  note?: string | null,
): Promise<GenerateResult> {
  const { result, trace } = await generateStructured({
    agent: prompt.generateMeta.agent,
    schema: prompt.generateMeta.schema,
    system: prompt.generateSystem,
    prompt: prompt.buildGenerateUser(slice, note),
    tier: prompt.generateMeta.tier,
    temperature: prompt.generateMeta.temperature,
    maxTokens: prompt.generateMeta.maxTokens,
    promptVersion: PROMPT_VERSION,
  });

  // Keep the three lens directions in a stable order, whatever order they arrive in.
  const byLens = new Map(result.directions.map((direction) => [direction.lens, direction]));
  const ordered = BATTLE_LENSES.map((lens) => byLens.get(lens)).filter(
    (direction): direction is BattleDirection => direction !== undefined,
  );
  const directions = (ordered.length === 3 ? ordered : result.directions)
    .slice(0, 3)
    .map(normaliseDirection);

  return { directions, trace };
}

export interface ChallengeResult {
  critique: BattleCritiqueOutput;
  trace: LlmTrace;
}

/** One call: Skeptic + Differentiation Expert score and challenge all three (call 2). */
export async function runBattleChallenge(
  slice: prompt.BattleSlice,
  directions: BattleDirection[],
): Promise<ChallengeResult> {
  const { result, trace } = await generateStructured({
    agent: prompt.challengeMeta.agent,
    schema: prompt.challengeMeta.schema,
    system: prompt.challengeSystem,
    prompt: prompt.buildChallengeUser(slice, directions),
    tier: prompt.challengeMeta.tier,
    temperature: prompt.challengeMeta.temperature,
    maxTokens: prompt.challengeMeta.maxTokens,
    promptVersion: PROMPT_VERSION,
  });

  const ids = new Set(directions.map((direction) => direction.id));
  const critiques = result.critiques
    .filter((critique) => ids.has(critique.direction_id))
    .map((critique) => ({
      ...critique,
      scores: clampScores(critique.scores),
      objections: critique.objections.slice(0, MAX_LIST),
      cliches: cleanList(critique.cliches, 6),
    }));

  // A recommendation for a direction that isn't on the table is worse than none.
  const recommendation = ids.has(result.recommendation.direction_id)
    ? result.recommendation
    : { direction_id: directions[0]!.id, reason: result.recommendation.reason };

  return { critique: { critiques, recommendation }, trace };
}

export interface SingleDirectionResult {
  direction: BattleDirection;
  note: string;
  trace: LlmTrace;
}

/** Combine two directions into one (user action, §14.3). */
export async function runBattleMerge(
  slice: prompt.BattleSlice,
  first: BattleDirection,
  second: BattleDirection,
  instruction: string | null,
): Promise<SingleDirectionResult> {
  const { result, trace } = await generateStructured({
    agent: prompt.mergeMeta.agent,
    schema: prompt.mergeMeta.schema,
    system: prompt.mergeSystem,
    prompt: prompt.buildMergeUser(slice, first, second, instruction),
    tier: prompt.mergeMeta.tier,
    temperature: prompt.mergeMeta.temperature,
    maxTokens: prompt.mergeMeta.maxTokens,
    promptVersion: PROMPT_VERSION,
  });

  return {
    direction: normaliseDirection({ ...result.direction, id: "merged" }),
    note: result.merge_note.trim(),
    trace,
  };
}

/** Regenerate one direction on the founder's instruction (user action, §14.3). */
export async function runBattleRevise(
  slice: prompt.BattleSlice,
  direction: BattleDirection,
  instruction: string,
): Promise<SingleDirectionResult> {
  const { result, trace } = await generateStructured({
    agent: prompt.reviseMeta.agent,
    schema: prompt.reviseMeta.schema,
    system: prompt.reviseSystem,
    prompt: prompt.buildReviseUser(slice, direction, instruction),
    tier: prompt.reviseMeta.tier,
    temperature: prompt.reviseMeta.temperature,
    maxTokens: prompt.reviseMeta.maxTokens,
    promptVersion: PROMPT_VERSION,
  });

  return {
    // The revision replaces one card: it keeps that card's id and lens.
    direction: normaliseDirection({ ...result.direction, id: direction.id, lens: direction.lens }),
    note: result.change_note.trim(),
    trace,
  };
}

export const PROMPT_VERSION = prompt.PROMPT_VERSION;
export const MIN_PERSONALITY_TRAITS = MIN_TRAITS;

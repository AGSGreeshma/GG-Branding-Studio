import "server-only";
import { generateStructured } from "@/lib/ai/llm";
import type { LlmTrace } from "@/lib/ai/types";
import type { LexiconHit } from "@/lib/lexicon/detect";
import * as prompt from "@/lib/prompts/anti-generic";
import type {
  AntiGenericCritique,
  CriticFinding,
  GenericScores,
  Revision,
} from "@/lib/schemas/outputs/anti-generic";

/*
 * Anti-Generic agents (plan §14.6, N4–N9). Pure: text in, judgement or
 * rewrite out. Thresholds, the loop and persistence live in the service.
 */

const MAX_ISSUES = 4;
const MAX_ALTERNATIVES = 2;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.round(value)));
}

function clampScores(scores: GenericScores): GenericScores {
  return {
    genericity_risk: clampScore(scores.genericity_risk),
    distinctiveness: clampScore(scores.distinctiveness),
    audience_fit: clampScore(scores.audience_fit),
    specificity: clampScore(scores.specificity),
  };
}

export interface CritiqueResult {
  critique: AntiGenericCritique;
  trace: LlmTrace;
}

/**
 * Scores each field and says what is wrong with it. Never rewrites.
 * Findings for paths that were not asked about are dropped, and a missing
 * finding is not invented: the caller treats an unjudged field as unchanged.
 */
export async function runAntiGenericCritic(
  slice: prompt.AntiGenericSlice,
  fields: prompt.FieldInput[],
  lexicon: Record<string, LexiconHit[]>,
): Promise<CritiqueResult> {
  const { result, trace } = await generateStructured({
    agent: prompt.criticMeta.agent,
    schema: prompt.criticMeta.schema,
    system: prompt.criticSystem,
    prompt: prompt.buildCriticUser(slice, fields, lexicon),
    tier: prompt.criticMeta.tier,
    temperature: prompt.criticMeta.temperature,
    maxTokens: prompt.criticMeta.maxTokens,
    promptVersion: PROMPT_VERSION,
  });

  const wanted = new Set(fields.map((field) => field.path));
  const seen = new Set<string>();
  const findings: CriticFinding[] = [];
  for (const finding of result.findings) {
    if (!wanted.has(finding.target_path) || seen.has(finding.target_path)) continue;
    seen.add(finding.target_path);
    findings.push({
      ...finding,
      scores: clampScores(finding.scores),
      issues: finding.issues.filter((issue) => issue.evidence.trim()).slice(0, MAX_ISSUES),
      alternatives: finding.alternatives
        .map((alternative) => alternative.trim())
        .filter(Boolean)
        .slice(0, MAX_ALTERNATIVES),
      verdict: finding.verdict.trim(),
    });
  }

  return { critique: { findings }, trace };
}

export interface RevisionResult {
  revisions: Revision[];
  trace: LlmTrace;
}

/**
 * Rewrites only the fields it is given. A revision for a path that was not
 * requested is dropped, which is the code-side half of "revise only the
 * flagged fields" (§13.5); the lock check happens in the service.
 */
export async function runAntiGenericReviser(
  slice: prompt.AntiGenericSlice,
  fields: prompt.FieldInput[],
  findings: CriticFinding[],
): Promise<RevisionResult> {
  const { result, trace } = await generateStructured({
    agent: prompt.reviserMeta.agent,
    schema: prompt.reviserMeta.schema,
    system: prompt.reviserSystem,
    prompt: prompt.buildReviserUser(slice, fields, findings),
    tier: prompt.reviserMeta.tier,
    temperature: prompt.reviserMeta.temperature,
    maxTokens: prompt.reviserMeta.maxTokens,
    promptVersion: PROMPT_VERSION,
  });

  const wanted = new Set(fields.map((field) => field.path));
  const seen = new Set<string>();
  const revisions: Revision[] = [];
  for (const revision of result.revisions) {
    const improved = revision.improved.trim();
    if (!wanted.has(revision.target_path) || seen.has(revision.target_path) || !improved) continue;
    seen.add(revision.target_path);
    revisions.push({ ...revision, improved, reason: revision.reason.trim() });
  }

  return { revisions, trace };
}

export const PROMPT_VERSION = prompt.PROMPT_VERSION;

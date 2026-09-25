import {
  type BrandContext,
  type ConfidenceEntry,
  type ProvenanceEntry,
} from "@/lib/schemas/brand-context";
import {
  INTERVIEW_UPDATE_PATHS,
  type ExtractedUpdate,
  type InterviewUpdatePath,
  type InterviewerOutput,
} from "@/lib/schemas/outputs/interviewer";

/*
 * Context manager (plan §12, F8). Two jobs:
 *   1. slice the Brand Context so each agent sees only what it needs;
 *   2. apply validated agent output back, with provenance, never touching a
 *      locked path (CLAUDE.md, AI rules 5 and 6).
 *
 * Pure and framework-free, so it is unit-testable and safe on either side.
 */

/** Everything the Interviewer needs and nothing else (plan §13.1). */
export interface InterviewerSlice {
  project: BrandContext["project"];
  problem: BrandContext["problem"];
  audience: BrandContext["audience"];
  product: BrandContext["product"];
  assumptions: string[];
  open_questions: string[];
}

export function sliceForInterviewer(context: BrandContext): InterviewerSlice {
  return {
    project: context.project,
    problem: context.problem,
    audience: context.audience,
    product: context.product,
    assumptions: context.meta.assumptions,
    open_questions: context.meta.open_questions,
  };
}

type PathKind = "text" | "list";

const UPDATE_PATH_KINDS: Record<InterviewUpdatePath, PathKind> = {
  "project.name": "text",
  "project.description": "text",
  "problem.statement": "text",
  "problem.importance": "text",
  "problem.existing_alternatives": "list",
  "audience.primary": "list",
  "audience.secondary": "list",
  "audience.needs": "list",
  "audience.pain_points": "list",
  "audience.behaviors": "list",
  "product.description": "text",
  "product.features": "list",
  "product.benefits": "list",
};

/** Paths §7.4 measures confidence on. Other confidence entries are dropped. */
export const TRACKED_CONFIDENCE_PATHS = [
  "problem.statement",
  "audience.primary",
  "product.description",
] as const;

const MAX_LIST_ITEMS = 12;
const MAX_TEXT_LENGTH = 600;
const MAX_META_ITEMS = 8;

/** True when `path` is locked, or sits inside a locked section (e.g. "audience" locks "audience.primary"). */
export function isPathLocked(path: string, lockedPaths: readonly string[]): boolean {
  return lockedPaths.some((locked) => path === locked || path.startsWith(`${locked}.`));
}

function cleanList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value.slice(0, MAX_TEXT_LENGTH));
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

function readPath(context: BrandContext, path: InterviewUpdatePath): string | string[] {
  const [section, field] = path.split(".") as [keyof BrandContext, string];
  const target = context[section] as Record<string, string | string[]>;
  return target[field]!;
}

function writePath(
  context: BrandContext,
  path: InterviewUpdatePath,
  value: string | string[],
): BrandContext {
  const [section, field] = path.split(".") as [keyof BrandContext, string];
  const current = context[section] as Record<string, unknown>;
  return { ...context, [section]: { ...current, [field]: value } };
}

function upsertProvenance(
  entries: ProvenanceEntry[],
  entry: ProvenanceEntry,
): ProvenanceEntry[] {
  return [...entries.filter((existing) => existing.path !== entry.path), entry];
}

function upsertConfidence(entries: ConfidenceEntry[], incoming: ConfidenceEntry[]): ConfidenceEntry[] {
  const kept = entries.filter(
    (existing) => !incoming.some((entry) => entry.path === existing.path),
  );
  return [...kept, ...incoming];
}

export interface ApplyOptions {
  /** Agent that produced the output, recorded in provenance. */
  agent: string;
  /** Whether the underlying facts came from the user or were inferred by the agent. */
  source: ProvenanceEntry["source"];
  runId: string | null;
  lockedPaths: readonly string[];
}

export interface ApplyResult {
  context: BrandContext;
  changedPaths: string[];
  /** Updates rejected because their path is locked. Surfaced in logs and the run trace. */
  blockedPaths: string[];
}

/**
 * Applies the Interviewer's extracted updates to the Brand Context.
 * Locked paths are skipped here, in code, not only in the prompt.
 * Text fields are replaced; list fields are merged and de-duplicated.
 */
export function applyExtractedUpdates(
  context: BrandContext,
  updates: readonly ExtractedUpdate[],
  options: ApplyOptions,
): ApplyResult {
  let next = context;
  const changedPaths: string[] = [];
  const blockedPaths: string[] = [];

  for (const update of updates) {
    const path = update.path;
    if (!INTERVIEW_UPDATE_PATHS.includes(path)) continue;
    if (isPathLocked(path, options.lockedPaths)) {
      if (!blockedPaths.includes(path)) blockedPaths.push(path);
      continue;
    }

    const current = readPath(next, path);
    let value: string | string[];

    if (UPDATE_PATH_KINDS[path] === "text") {
      const text = (update.values[0] ?? "").trim().slice(0, MAX_TEXT_LENGTH);
      if (!text || text === current) continue;
      value = text;
    } else {
      const merged = cleanList([...(current as string[]), ...update.values]);
      if (merged.length === (current as string[]).length) continue;
      value = merged;
    }

    next = writePath(next, path, value);
    if (!changedPaths.includes(path)) changedPaths.push(path);
    next = {
      ...next,
      provenance: upsertProvenance(next.provenance, {
        path,
        source: options.source,
        agent: options.agent,
        run_id: options.runId,
        decision_id: null,
        derived_from: update.evidence.trim() ? [update.evidence.trim().slice(0, MAX_TEXT_LENGTH)] : [],
      }),
    };
  }

  return { context: next, changedPaths, blockedPaths };
}

/**
 * Applies one Interviewer turn: extracted updates, confidence, assumptions and
 * open questions. Assumptions and open questions are replaced each turn because
 * the agent restates the current ones (plan §14.1).
 */
export function applyInterviewerOutput(
  context: BrandContext,
  output: InterviewerOutput,
  options: ApplyOptions,
): ApplyResult {
  const applied = applyExtractedUpdates(context, output.extracted_updates, options);

  const confidence = output.confidence.filter((entry) =>
    (TRACKED_CONFIDENCE_PATHS as readonly string[]).includes(entry.path),
  );

  return {
    ...applied,
    context: {
      ...applied.context,
      meta: {
        assumptions: cleanList(output.assumptions).slice(0, MAX_META_ITEMS),
        open_questions: cleanList(output.missing_information).slice(0, MAX_META_ITEMS),
        confidence: upsertConfidence(applied.context.meta.confidence, confidence),
      },
    },
  };
}

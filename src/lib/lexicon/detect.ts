import {
  BUZZWORDS,
  EMPTY_CLAIMS,
  NAMING_PATTERNS,
  STARTUP_PHRASES,
  type LexiconKind,
  type Severity,
  type TermEntry,
} from "./terms";

/*
 * Deterministic generic-language detection (plan §14.6, N1–N3, N12).
 * Pure functions: same text in, same hits out, no model involved. The LLM
 * critic handles what a word list cannot (CLAUDE.md, AI rule 9).
 */

export interface LexiconHit {
  kind: LexiconKind;
  /** The text exactly as it appears, so the UI can show it back. */
  match: string;
  /** Character offsets into the analysed string, for inline highlighting. */
  start: number;
  end: number;
  severity: Severity;
  note: string;
}

export interface FieldHits {
  /** Dotted Brand Context path, or any label the caller uses. */
  path: string;
  text: string;
  hits: LexiconHit[];
}

const SEVERITY_ORDER: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

/** Escapes a term for use inside a regular expression. */
function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches the term as a whole word, allowing the usual inflections, and
 * treating hyphens and spaces as interchangeable ("next-gen" ≡ "next gen").
 */
function patternFor(term: string): RegExp {
  const flexible = escape(term).replace(/[-\s]/g, "[-\\s]");
  return new RegExp(`\\b${flexible}(?:s|es|ed|ing|ment|ise|ize|ised|ized|ising|izing)?\\b`, "gi");
}

function findTerms(text: string, entries: TermEntry[], kind: LexiconKind): LexiconHit[] {
  const hits: LexiconHit[] = [];
  for (const entry of entries) {
    const pattern = patternFor(entry.term);
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      hits.push({
        kind,
        match: match[0],
        start: match.index,
        end: match.index + match[0].length,
        severity: entry.severity,
        note: entry.note,
      });
    }
  }
  return hits;
}

/**
 * Drops hits contained inside a longer hit, so "the future of" is reported
 * once rather than alongside every shorter phrase inside it. The longest,
 * then most severe, match wins.
 */
function dropOverlaps(hits: LexiconHit[]): LexiconHit[] {
  const sorted = [...hits].sort((a, b) => {
    const lengthDiff = b.end - b.start - (a.end - a.start);
    if (lengthDiff !== 0) return lengthDiff;
    return SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
  });

  const kept: LexiconHit[] = [];
  for (const hit of sorted) {
    const overlaps = kept.some((existing) => hit.start < existing.end && existing.start < hit.end);
    if (!overlaps) kept.push(hit);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Every generic-language hit in one piece of prose. */
export function detectGeneric(text: string): LexiconHit[] {
  if (!text.trim()) return [];
  return dropOverlaps([
    ...findTerms(text, EMPTY_CLAIMS, "empty_claim"),
    ...findTerms(text, STARTUP_PHRASES, "startup_phrase"),
    ...findTerms(text, BUZZWORDS, "buzzword"),
  ]);
}

/**
 * Naming-shape problems for one candidate name (N5). Prose rules do not apply
 * here: a name is judged on its shape, not its vocabulary.
 */
export function detectNamingPatterns(name: string): LexiconHit[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const hits: LexiconHit[] = [];
  for (const pattern of NAMING_PATTERNS) {
    if (pattern.test.test(trimmed)) {
      hits.push({
        kind: "naming_pattern",
        match: trimmed,
        start: 0,
        end: trimmed.length,
        severity: pattern.severity,
        note: pattern.note,
      });
    }
  }
  return hits;
}

/** Runs the prose rules over several named fields at once. */
export function detectAcrossFields(fields: Array<{ path: string; text: string }>): FieldHits[] {
  return fields.map((field) => ({
    path: field.path,
    text: field.text,
    hits: detectGeneric(field.text),
  }));
}

export function highestSeverity(hits: readonly LexiconHit[]): Severity | null {
  if (hits.length === 0) return null;
  return hits.reduce<Severity>(
    (worst, hit) => (SEVERITY_ORDER[hit.severity] > SEVERITY_ORDER[worst] ? hit.severity : worst),
    "low",
  );
}

export function hasHighSeverity(hits: readonly LexiconHit[]): boolean {
  return hits.some((hit) => hit.severity === "high");
}

export function countBySeverity(hits: readonly LexiconHit[]): Record<Severity, number> {
  return {
    low: hits.filter((hit) => hit.severity === "low").length,
    medium: hits.filter((hit) => hit.severity === "medium").length,
    high: hits.filter((hit) => hit.severity === "high").length,
  };
}

/**
 * Splits text into plain and flagged segments so the UI can highlight hits
 * inline without doing its own matching (N11).
 */
export interface TextSegment {
  text: string;
  hit: LexiconHit | null;
}

export function segmentText(text: string, hits: readonly LexiconHit[]): TextSegment[] {
  if (hits.length === 0) return text ? [{ text, hit: null }] : [];
  const ordered = [...hits].sort((a, b) => a.start - b.start);
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const hit of ordered) {
    if (hit.start > cursor) segments.push({ text: text.slice(cursor, hit.start), hit: null });
    segments.push({ text: text.slice(hit.start, hit.end), hit });
    cursor = hit.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: null });
  return segments;
}

export { type LexiconKind, type Severity } from "./terms";

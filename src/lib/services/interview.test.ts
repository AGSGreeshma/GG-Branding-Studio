import { describe, expect, it } from "vitest";
import { emptyBrandContext, type BrandContext, type ConfidenceEntry } from "@/lib/schemas/brand-context";
import { decideCompletion, hasEnoughConfidence, MAX_INTERVIEW_QUESTIONS } from "./interview";

/*
 * Interview completion rule (plan §7.4). Each of the three exit conditions,
 * and the case where none of them applies.
 */

function contextWith(levels: Partial<Record<string, ConfidenceEntry["level"]>>): BrandContext {
  const context = emptyBrandContext({ stage: "idea" });
  return {
    ...context,
    meta: {
      ...context.meta,
      confidence: Object.entries(levels).map(([path, level]) => ({
        path,
        level: level as ConfidenceEntry["level"],
      })),
    },
  };
}

const allHigh = contextWith({
  "problem.statement": "high",
  "audience.primary": "high",
  "product.description": "high",
});

describe("hasEnoughConfidence", () => {
  it("is true only when all three tracked fields score at least 0.7", () => {
    expect(hasEnoughConfidence(allHigh)).toBe(true);
  });

  it("is false when one field is only medium", () => {
    const context = contextWith({
      "problem.statement": "high",
      "audience.primary": "high",
      "product.description": "medium",
    });
    expect(hasEnoughConfidence(context)).toBe(false);
  });

  it("is false when a field has no confidence entry at all", () => {
    const context = contextWith({ "problem.statement": "high", "audience.primary": "high" });
    expect(hasEnoughConfidence(context)).toBe(false);
  });
});

describe("decideCompletion", () => {
  it("ends on confidence", () => {
    expect(decideCompletion({ context: allHigh, questionsAsked: 2, skipRequested: false })).toEqual({
      complete: true,
      reason: "confidence",
    });
  });

  it("ends after six questions even with low confidence", () => {
    expect(
      decideCompletion({
        context: emptyBrandContext(),
        questionsAsked: MAX_INTERVIEW_QUESTIONS,
        skipRequested: false,
      }),
    ).toEqual({ complete: true, reason: "question_limit" });
  });

  it("ends when the user says that's enough, whatever the confidence", () => {
    expect(
      decideCompletion({ context: emptyBrandContext(), questionsAsked: 1, skipRequested: true }),
    ).toEqual({ complete: true, reason: "user_skipped" });
  });

  it("keeps going when no exit condition is met", () => {
    expect(
      decideCompletion({ context: emptyBrandContext(), questionsAsked: 3, skipRequested: false }),
    ).toEqual({ complete: false, reason: null });
  });
});

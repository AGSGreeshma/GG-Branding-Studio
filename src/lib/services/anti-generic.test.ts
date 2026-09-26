import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBrandContext, type BrandContext } from "@/lib/schemas/brand-context";
import type { CriticFinding } from "@/lib/schemas/outputs/anti-generic";
import type { LexiconHit } from "@/lib/lexicon/detect";

/*
 * The Anti-Generic revision loop (plan §13.5, §14.6, N13).
 * The thresholds and the lock rule are the whole contract, so they are tested
 * directly rather than through a route.
 */

const mocks = vi.hoisted(() => ({
  critic: vi.fn(),
  reviser: vi.fn(),
}));

vi.mock("@/lib/agents/anti-generic", () => ({
  runAntiGenericCritic: mocks.critic,
  runAntiGenericReviser: mocks.reviser,
}));

const {
  ANTI_GENERIC_FIELDS,
  collectFields,
  maxRounds,
  runAntiGenericRound,
  scoreDeltas,
  shouldRevise,
  triggeredPaths,
  TRIGGER,
} = await import("./anti-generic");

const trace = {
  agent: "anti_generic_critic",
  model: "test-fast-model",
  promptVersion: "1.0.0",
  tokensIn: 500,
  tokensOut: 300,
  latencyMs: 900,
  retryCount: 0,
  errorCode: null,
};

const goodScores = { genericity_risk: 3, distinctiveness: 8, audience_fit: 8, specificity: 8 };
const badScores = { genericity_risk: 7, distinctiveness: 5, audience_fit: 5, specificity: 4 };

function finding(path: string, scores = goodScores): CriticFinding {
  return { target_path: path, issues: [], scores, alternatives: [], verdict: "fine" };
}

function contextWith(values: Partial<Record<string, string>>): BrandContext {
  const context = emptyBrandContext({ stage: "idea" });
  return {
    ...context,
    positioning: {
      ...context.positioning,
      statement: values["positioning.statement"] ?? "",
      differentiator: values["positioning.differentiator"] ?? "",
      value_proposition: values["positioning.value_proposition"] ?? "",
    },
    identity: {
      ...context.identity,
      naming_direction: values["identity.naming_direction"] ?? "",
      tagline: values["identity.tagline"] ?? "",
    },
  };
}

const slice = {
  problem: "Students cannot tell who will do the work",
  audience: ["College students"],
  product: "An app for finding reliable teammates",
  positioning: "A visible record of finished projects",
  differentiator: "Confirmed by teammates",
  alternatives: ["Group chats"],
};

const hit = (severity: LexiconHit["severity"]): LexiconHit => ({
  kind: "buzzword",
  match: "empower",
  start: 0,
  end: 7,
  severity,
  note: "says nothing",
});

beforeEach(() => {
  mocks.critic.mockReset();
  mocks.reviser.mockReset();
  vi.unstubAllEnvs();
});

describe("shouldRevise", () => {
  it("leaves a strong line alone", () => {
    expect(shouldRevise(finding("a"), [])).toBe(false);
  });

  it.each([
    ["genericity risk at the threshold", { ...goodScores, genericity_risk: TRIGGER.genericityRiskAtLeast }],
    ["distinctiveness at the threshold", { ...goodScores, distinctiveness: TRIGGER.distinctivenessAtMost }],
    ["audience fit at the threshold", { ...goodScores, audience_fit: TRIGGER.audienceFitAtMost }],
  ])("triggers on %s", (_label, scores) => {
    expect(shouldRevise(finding("a", scores), [])).toBe(true);
  });

  it("does not trigger just below each threshold", () => {
    expect(shouldRevise(finding("a", { ...goodScores, genericity_risk: 4 }), [])).toBe(false);
    expect(shouldRevise(finding("a", { ...goodScores, distinctiveness: 7 }), [])).toBe(false);
    expect(shouldRevise(finding("a", { ...goodScores, audience_fit: 7 }), [])).toBe(false);
  });

  it("triggers on a high-severity lexicon hit whatever the model thinks", () => {
    expect(shouldRevise(finding("a"), [hit("high")])).toBe(true);
    expect(shouldRevise(finding("a"), [hit("medium")])).toBe(false);
  });

  it("does not trigger on a field the critic never judged", () => {
    expect(shouldRevise(undefined, [])).toBe(false);
    expect(shouldRevise(undefined, [hit("high")])).toBe(true);
  });
});

describe("collectFields and triggeredPaths", () => {
  it("collects only the fields that have content", () => {
    const fields = collectFields(
      contextWith({
        "positioning.statement": "A visible record of finished projects",
        "identity.tagline": "   ",
      }),
      [],
    );
    expect(fields.map((field) => field.path)).toEqual(["positioning.statement"]);
    expect(fields[0]!.original).toBe(fields[0]!.current);
  });

  it("marks locked fields and never triggers them", () => {
    const context = contextWith({
      "positioning.statement": "Empowering the future of student teams",
      "positioning.differentiator": "World-class matching",
    });
    const fields = collectFields(context, ["positioning.statement"]);

    expect(fields.find((field) => field.path === "positioning.statement")!.locked).toBe(true);

    const triggered = triggeredPaths(
      fields,
      [finding("positioning.statement", badScores), finding("positioning.differentiator", badScores)],
      { "positioning.statement": [hit("high")], "positioning.differentiator": [] },
    );
    expect(triggered).toEqual(["positioning.differentiator"]);
  });

  it("knows every field it is allowed to touch", () => {
    expect(ANTI_GENERIC_FIELDS.map((field) => field.path)).toContain("identity.tagline");
    expect(ANTI_GENERIC_FIELDS.every((field) => field.purpose.length > 0)).toBe(true);
  });
});

describe("maxRounds", () => {
  it("defaults to two", () => {
    expect(maxRounds()).toBe(2);
  });

  it.each([
    ["1", 1],
    ["3", 3],
    ["99", 5],
    ["0", 2],
    ["nonsense", 2],
  ])("reads %s as %s", (value, expected) => {
    vi.stubEnv("ANTI_GENERIC_MAX_ROUNDS", value);
    expect(maxRounds()).toBe(expected);
  });
});

describe("runAntiGenericRound", () => {
  const fields = [
    {
      path: "positioning.statement",
      label: "Positioning statement",
      original: "We empower students to unlock world-class teamwork.",
      current: "We empower students to unlock world-class teamwork.",
      locked: false,
      previous: null,
      best_quality: null,
    },
    {
      path: "positioning.differentiator",
      label: "Differentiator",
      original: "Confirmed by the teammates who worked with them.",
      current: "Confirmed by the teammates who worked with them.",
      locked: false,
      previous: null,
      best_quality: null,
    },
  ];

  it("stops without a reviser call when nothing crosses a threshold", async () => {
    mocks.critic.mockResolvedValue({
      critique: { findings: fields.map((field) => finding(field.path)) },
      trace,
    });

    const output = await runAntiGenericRound({
      slice,
      // The first field's text is full of buzzwords, so use clean copy here.
      fields: fields.map((field) => ({ ...field, original: "Clean copy.", current: "Clean copy." })),
      roundNumber: 1,
      maxRounds: 2,
    });

    expect(mocks.reviser).not.toHaveBeenCalled();
    expect(output.done).toBe(true);
    expect(output.round.changes).toEqual([]);
    expect(output.round.stopped_because).toContain("Nothing crossed");
  });

  it("rewrites only the fields that crossed a threshold", async () => {
    mocks.critic.mockResolvedValue({
      critique: {
        findings: [
          finding("positioning.statement", badScores),
          finding("positioning.differentiator", goodScores),
        ],
      },
      trace,
    });
    mocks.reviser.mockResolvedValue({
      revisions: [
        {
          target_path: "positioning.statement",
          improved: "Students see what a teammate finished before they agree to work with them.",
          reason: "Replaced the buzzwords with the moment the student decides.",
        },
      ],
      trace,
    });

    const output = await runAntiGenericRound({ slice, fields, roundNumber: 1, maxRounds: 2 });

    // The reviser was handed exactly one field.
    expect(mocks.reviser.mock.calls[0]![1]).toHaveLength(1);
    expect(output.round.triggered_paths).toEqual(["positioning.statement"]);
    expect(output.round.changes).toHaveLength(1);
    expect(output.fields[0]!.current).toContain("before they agree");
    expect(output.fields[1]!.current).toBe(fields[1]!.current);
    // A rewrite always earns a verification round (ADR-029).
    expect(output.done).toBe(false);
    expect(output.fields[0]!.previous).toBe(fields[0]!.current);
  });

  it("never rewrites a locked field, even when the critic rejects it", async () => {
    mocks.critic.mockResolvedValue({
      critique: { critiques: [], findings: fields.map((field) => finding(field.path, badScores)) },
      trace,
    });
    // A reviser that misbehaves and returns the locked field anyway.
    mocks.reviser.mockResolvedValue({
      revisions: [
        {
          target_path: "positioning.statement",
          improved: "SHOULD NEVER BE WRITTEN",
          reason: "ignoring the lock",
        },
        {
          target_path: "positioning.differentiator",
          improved: "The record belongs to the student, not to us.",
          reason: "Named who owns it.",
        },
      ],
      trace,
    });

    const locked = [{ ...fields[0]!, locked: true }, fields[1]!];
    const output = await runAntiGenericRound({ slice, fields: locked, roundNumber: 1, maxRounds: 2 });

    expect(output.round.triggered_paths).toEqual(["positioning.differentiator"]);
    expect(output.fields[0]!.current).toBe(fields[0]!.current);
    expect(output.round.changes.map((change) => change.path)).toEqual([
      "positioning.differentiator",
    ]);
  });

  it("spends the final round verifying rather than rewriting again", async () => {
    mocks.critic.mockResolvedValue({
      critique: { findings: fields.map((field) => finding(field.path, badScores)) },
      trace,
    });
    mocks.reviser.mockResolvedValue({ revisions: [], trace });

    const output = await runAntiGenericRound({ slice, fields, roundNumber: 2, maxRounds: 2 });

    // Bad scores, but the cap means no more rewriting — only judgement.
    expect(mocks.reviser).not.toHaveBeenCalled();
    expect(output.done).toBe(true);
    expect(output.round.changes).toEqual([]);
    expect(output.round.stopped_because).toContain("2 rounds");
  });

  it("keeps a rewrite that the next round scores better", async () => {
    mocks.critic.mockResolvedValue({
      critique: { findings: [finding("positioning.statement", goodScores)] },
      trace,
    });

    const rewritten = [
      {
        ...fields[0]!,
        current: "The rewrite.",
        previous: "The original.",
        // The original scored 14; the rewrite scores 21 (good scores).
        best_quality: 14,
      },
    ];
    const output = await runAntiGenericRound({
      slice,
      fields: rewritten,
      roundNumber: 2,
      maxRounds: 2,
    });

    expect(output.round.reverted).toEqual([]);
    expect(output.fields[0]!.current).toBe("The rewrite.");
  });

  it("rolls back a rewrite that the next round scores worse (ADR-029)", async () => {
    mocks.critic.mockResolvedValue({
      critique: { findings: [finding("positioning.statement", badScores)] },
      trace,
    });

    const rewritten = [
      {
        ...fields[0]!,
        current: "The worse rewrite.",
        previous: "The original.",
        // The original scored 20; this rewrite scores 7 (bad scores).
        best_quality: 20,
      },
    ];
    const output = await runAntiGenericRound({
      slice,
      fields: rewritten,
      roundNumber: 2,
      maxRounds: 2,
    });

    expect(output.fields[0]!.current).toBe("The original.");
    expect(output.round.reverted).toEqual([
      {
        path: "positioning.statement",
        label: "Positioning statement",
        kept: "The original.",
        discarded: "The worse rewrite.",
      },
    ]);
  });

  it("does not immediately rewrite a field it has just rolled back", async () => {
    mocks.critic.mockResolvedValue({
      critique: { findings: [finding("positioning.statement", badScores)] },
      trace,
    });
    mocks.reviser.mockResolvedValue({ revisions: [], trace });

    const rewritten = [
      { ...fields[0]!, current: "The worse rewrite.", previous: "The original.", best_quality: 20 },
    ];
    // Round 2 of 3, so rewriting is still allowed — but not for this field.
    const output = await runAntiGenericRound({
      slice,
      fields: rewritten,
      roundNumber: 2,
      maxRounds: 3,
    });

    expect(output.round.triggered_paths).toEqual([]);
    expect(output.fields[0]!.current).toBe("The original.");
  });

  it("stops when a round produces no actual change", async () => {
    mocks.critic.mockResolvedValue({
      critique: { findings: fields.map((field) => finding(field.path, badScores)) },
      trace,
    });
    mocks.reviser.mockResolvedValue({
      revisions: fields.map((field) => ({
        target_path: field.path,
        improved: field.current,
        reason: "already as good as the facts allow",
      })),
      trace,
    });

    const output = await runAntiGenericRound({ slice, fields, roundNumber: 1, maxRounds: 3 });

    expect(output.round.changes).toEqual([]);
    expect(output.done).toBe(true);
  });

  it("runs the word lists before the model and passes the hits on", async () => {
    mocks.critic.mockResolvedValue({
      critique: { findings: [finding("positioning.statement", goodScores)] },
      trace,
    });
    mocks.reviser.mockResolvedValue({ revisions: [], trace });

    const output = await runAntiGenericRound({
      slice,
      fields: [fields[0]!],
      roundNumber: 1,
      maxRounds: 2,
    });

    const lexiconArgument = mocks.critic.mock.calls[0]![2] as Record<string, LexiconHit[]>;
    expect(lexiconArgument["positioning.statement"]!.length).toBeGreaterThan(0);
    // "world-class" is high severity, so the round triggers despite good scores.
    expect(output.round.triggered_paths).toEqual(["positioning.statement"]);
  });
});

describe("scoreDeltas", () => {
  it("compares the first and last round", () => {
    const rounds = [
      { round: 1, findings: [finding("a", badScores)], lexicon: [], triggered_paths: ["a"], changes: [], reverted: [], stopped_because: null },
      { round: 2, findings: [finding("a", goodScores)], lexicon: [], triggered_paths: [], changes: [], reverted: [], stopped_because: "done" },
    ];
    const deltas = scoreDeltas(rounds);
    expect(deltas[0]!.before.genericity_risk).toBe(7);
    expect(deltas[0]!.after.genericity_risk).toBe(3);
  });

  it("has nothing to compare after a single round", () => {
    expect(scoreDeltas([])).toEqual([]);
  });
});

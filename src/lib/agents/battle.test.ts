import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ model: null as unknown }));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => mocks.model) }));

import {
  BattleCritiqueOutputSchema,
  BattleGenerateOutputSchema,
  type BattleDirection,
} from "@/lib/schemas/outputs/battle";
import { checkDivergence, runBattleChallenge, runBattleGenerate } from "./battle";
import generateFixture from "../../../scripts/stub/fixtures/battle_generate.json";
import challengeFixture from "../../../scripts/stub/fixtures/battle_challenge.json";

/*
 * Brand Battle Lite (plan §14.3). The stub fixtures are the realistic mock
 * outputs, so a fixture that stops matching the schema fails here rather than
 * halfway through a demo.
 */

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

function reply(payload: unknown): GenerateResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 420, text: 420, reasoning: undefined },
    },
    warnings: [],
  };
}

function useModel(payload: unknown): MockLanguageModelV4 {
  const model = new MockLanguageModelV4({ doGenerate: reply(payload) });
  mocks.model = model;
  return model;
}

const slice = {
  problem: {
    statement: "Students can't tell who is reliable",
    importance: "A bad teammate costs a semester",
    existing_alternatives: ["Group chats"],
  },
  audience: {
    primary: ["College students"],
    secondary: [],
    needs: ["A way to judge reliability"],
    pain_points: ["Teammates drop out"],
    behaviors: [],
  },
  product: {
    description: "An app for finding reliable teammates",
    features: ["Profiles"],
    benefits: [],
  },
  assumptions: ["Most users are undergraduates"],
};

const firstGenerate = generateFixture.outputs[0]!;
const firstChallenge = challengeFixture.outputs[0]!;

function direction(overrides: Partial<BattleDirection>): BattleDirection {
  return { ...(firstGenerate.directions[0] as BattleDirection), ...overrides };
}

beforeEach(() => {
  vi.stubEnv("MODEL_PRIMARY", "test-primary-model");
  vi.stubEnv("MODEL_FAST", "test-fast-model");
  vi.stubEnv("OPENAI_OMIT_TEMPERATURE", "0");
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("battle schemas", () => {
  it("validate the shipped stub fixtures", () => {
    expect(BattleGenerateOutputSchema.parse(firstGenerate).directions).toHaveLength(3);
    expect(BattleCritiqueOutputSchema.parse(firstChallenge).critiques).toHaveLength(3);
    for (const output of generateFixture.outputs) {
      expect(BattleGenerateOutputSchema.safeParse(output).success).toBe(true);
    }
  });

  it("rejects the deliberately invalid fixture that exercises the repair retry", () => {
    expect(BattleCritiqueOutputSchema.safeParse(challengeFixture.invalid_output).success).toBe(
      false,
    );
  });
});

describe("checkDivergence", () => {
  it("accepts three directions that differ in audience or category", () => {
    expect(checkDivergence(firstGenerate.directions as BattleDirection[]).ok).toBe(true);
  });

  it("flags two directions aimed at the same audience in the same category", () => {
    const result = checkDivergence([
      direction({ id: "a" }),
      direction({ id: "b", name: "Another name" }),
      direction({ id: "c", audience_focus: "Completely different people" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.collision).toEqual(["a", "b"]);
    expect(result.message).toContain("A and B");
  });

  it("ignores wording, casing and filler words when comparing", () => {
    const result = checkDivergence([
      direction({ id: "a", audience_focus: "Students who have been burned by a teammate" }),
      direction({ id: "b", audience_focus: "students who have been burned by teammate!" }),
      direction({ id: "c", audience_focus: "Club organisers" }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("accepts directions that share an audience but claim a different category", () => {
    const result = checkDivergence([
      direction({ id: "a" }),
      direction({
        id: "b",
        positioning: { ...firstGenerate.directions[0]!.positioning, category: "Something else" },
      }),
      direction({ id: "c", audience_focus: "Club organisers" }),
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("runBattleGenerate", () => {
  it("returns the three directions in lens order and trims the lists", async () => {
    const shuffled = {
      directions: [
        firstGenerate.directions[2],
        firstGenerate.directions[0],
        {
          ...firstGenerate.directions[1],
          personality: ["One", "one", "Two", "Three", "Four", "Five", "Six"],
          strengths: ["A", "B", "C", "D"],
        },
      ],
    };
    useModel(shuffled);

    const { directions, trace } = await runBattleGenerate(slice);

    expect(directions.map((entry) => entry.lens)).toEqual([
      "strategist",
      "creative_director",
      "audience_advocate",
    ]);
    expect(directions[1]!.personality).toEqual(["One", "Two", "Three", "Four", "Five"]);
    expect(directions[1]!.strengths).toHaveLength(3);
    expect(trace.agent).toBe("battle_generate");
    expect(trace.model).toBe("test-primary-model");
  });

  it("keeps at most three rejected obvious ideas per direction", async () => {
    useModel({
      directions: [
        {
          ...firstGenerate.directions[0],
          obvious_ideas_rejected: ["One — a", "one — a", "Two — b", "Three — c", "Four — d"],
        },
        firstGenerate.directions[1],
        firstGenerate.directions[2],
      ],
    });

    const { directions } = await runBattleGenerate(slice);

    expect(directions[0]!.obvious_ideas_rejected).toEqual(["One — a", "Two — b", "Three — c"]);
  });

  it("asks the model to name the predictable ideas before writing its own", async () => {
    const model = useModel(firstGenerate);

    await runBattleGenerate(slice);

    const system = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(system).toContain("obvious_ideas_rejected");
    expect(system).toContain("almost anyone would reach for first");
  });

  it("passes a regeneration note into the prompt", async () => {
    const model = useModel(firstGenerate);

    await runBattleGenerate(slice, "Make every direction aim at a different audience.");

    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
      "Make every direction aim at a different audience.",
    );
  });
});

describe("runBattleChallenge", () => {
  const directions = firstGenerate.directions as BattleDirection[];

  it("clamps scores into 1–10 and keeps only critiques for real directions", async () => {
    useModel({
      critiques: [
        {
          ...firstChallenge.critiques[0],
          scores: {
            audience_fit: 14,
            clarity: 0,
            distinctiveness: 7.6,
            specificity: 8,
            strategic_strength: 8,
            genericity_risk: -3,
          },
        },
        { ...firstChallenge.critiques[1], direction_id: "merged" },
      ],
      recommendation: firstChallenge.recommendation,
    });

    const { critique } = await runBattleChallenge(slice, directions);

    expect(critique.critiques).toHaveLength(1);
    expect(critique.critiques[0]!.scores).toMatchObject({
      audience_fit: 10,
      clarity: 1,
      distinctiveness: 8,
      genericity_risk: 1,
    });
  });

  it("never recommends a direction that is not on the table", async () => {
    useModel({
      critiques: firstChallenge.critiques,
      recommendation: { direction_id: "merged", reason: "It blends the best of both." },
    });

    const { critique } = await runBattleChallenge(slice, directions);

    expect(critique.recommendation.direction_id).toBe("a");
    expect(critique.recommendation.reason).toBe("It blends the best of both.");
  });

  it("runs the critic on the fast model, separately from the generator", async () => {
    const model = useModel(firstChallenge);

    const { trace } = await runBattleChallenge(slice, directions);

    expect(trace.model).toBe("test-fast-model");
    expect(model.doGenerateCalls[0]?.temperature).toBe(0.2);
  });
});

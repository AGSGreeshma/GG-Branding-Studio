import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Swap the OpenAI provider for the AI SDK mock model. No network calls in tests.
const mocks = vi.hoisted(() => ({ model: null as unknown }));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => mocks.model) }));

import { emptyBrandContext } from "@/lib/schemas/brand-context";
import { InterviewerOutputSchema } from "@/lib/schemas/outputs/interviewer";
import type { InterviewTurn } from "@/lib/schemas/interview";
import { runInterviewer } from "./interviewer";

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

function reply(payload: unknown): GenerateResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 400, noCache: 400, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 180, text: 180, reasoning: undefined },
    },
    warnings: [],
  };
}

/** A realistic Interviewer response for the demo idea (plan §23.1). */
const REALISTIC_OUTPUT = {
  refusal: null,
  known_information: [
    "The user is building an app for college students to find project teammates",
  ],
  missing_information: [
    "Why current ways of finding teammates fail",
    "Whether this is for coursework, hackathons or side projects",
  ],
  assumptions: ["Students already try to find teammates through group chats"],
  next_question: "When students look for teammates today, what usually goes wrong?",
  question_reason:
    "The failure they feel most strongly is what your brand will promise to fix.",
  suggested_answers: [
    "Nobody replies in group chats",
    "Teammates drop out halfway",
    "You can't tell who is reliable",
  ],
  confidence: [
    { path: "problem.statement", level: "medium" },
    { path: "audience.primary", level: "high" },
    { path: "product.description", level: "medium" },
  ],
  extracted_updates: [
    {
      path: "audience.primary",
      values: ["College students"],
      evidence: "helps college students find reliable teammates",
    },
    {
      path: "product.description",
      values: ["An app that helps college students find reliable teammates"],
      evidence: "I want to build an app that helps college students find reliable teammates",
    },
  ],
};

const turns: InterviewTurn[] = [
  {
    id: "t1",
    role: "user",
    content: "I want to build an app that helps college students find reliable teammates",
    question_reason: null,
    suggested_answers: [],
    created_at: new Date().toISOString(),
  },
];

function useModel(payload: unknown): MockLanguageModelV4 {
  const model = new MockLanguageModelV4({ doGenerate: reply(payload) });
  mocks.model = model;
  return model;
}

const input = {
  entryStage: "idea" as const,
  context: emptyBrandContext({ stage: "idea" }),
  turns,
  questionsAsked: 1,
  lockedPaths: [] as string[],
};

beforeEach(() => {
  vi.stubEnv("MODEL_FAST", "test-fast-model");
  vi.stubEnv("OPENAI_OMIT_TEMPERATURE", "0");
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("InterviewerOutputSchema", () => {
  it("validates a realistic model response", () => {
    expect(InterviewerOutputSchema.parse(REALISTIC_OUTPUT)).toEqual(REALISTIC_OUTPUT);
  });

  it("rejects an update to a path the Interviewer may not write", () => {
    const bad = {
      ...REALISTIC_OUTPUT,
      extracted_updates: [{ path: "identity.tagline", values: ["Find your people"], evidence: "x" }],
    };
    expect(InterviewerOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe("runInterviewer", () => {
  it("returns validated output and a trace, and sends the answer as delimited data", async () => {
    const model = useModel(REALISTIC_OUTPUT);

    const { output, trace } = await runInterviewer(input);

    expect(output.next_question).toBe(REALISTIC_OUTPUT.next_question);
    expect(output.extracted_updates).toHaveLength(2);
    expect(trace).toMatchObject({ agent: "interviewer", model: "test-fast-model", retryCount: 0 });

    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain("<user_content>");
    expect(prompt).toContain("Questions left before this interview ends: 5");
  });

  it("keeps at most four suggested answers and drops duplicates", async () => {
    useModel({
      ...REALISTIC_OUTPUT,
      suggested_answers: ["One", "one", "Two", "Three", "Four", "Five"],
    });

    const { output } = await runInterviewer(input);

    expect(output.suggested_answers).toEqual(["One", "Two", "Three", "Four"]);
  });

  it("drops a single suggested answer rather than showing one lonely chip", async () => {
    useModel({ ...REALISTIC_OUTPUT, suggested_answers: ["Only one"] });

    const { output } = await runInterviewer(input);

    expect(output.suggested_answers).toEqual([]);
  });

  it("returns a decline with no question and no extracted facts", async () => {
    useModel({
      ...REALISTIC_OUTPUT,
      refusal: "I can't help brand that, sorry. Tell me about a different idea and we'll start there.",
    });

    const { output } = await runInterviewer(input);

    expect(output.refusal).toContain("I can't help brand that");
    expect(output.next_question).toBe("");
    expect(output.extracted_updates).toEqual([]);
    expect(output.confidence).toEqual([]);
  });

  it("tells the model which paths are locked", async () => {
    const model = useModel(REALISTIC_OUTPUT);

    await runInterviewer({ ...input, lockedPaths: ["problem.statement"] });

    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
      "must not be changed: problem.statement",
    );
  });
});

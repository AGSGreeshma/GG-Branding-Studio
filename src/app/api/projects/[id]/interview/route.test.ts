import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBrandContext, type BrandContext } from "@/lib/schemas/brand-context";
import { AppError } from "@/lib/schemas/errors";
import type { InterviewTurn } from "@/lib/schemas/interview";
import type { InterviewerOutput } from "@/lib/schemas/outputs/interviewer";
import type { WorkflowPlan } from "@/lib/schemas/workflow";
import { defaultPlanFor } from "@/lib/services/workflow-engine";

/*
 * Interview route (H7). The database and the model are faked; what is under
 * test is the route's own behaviour: owner scoping, persistence order,
 * completion in code (§7.4) and lock enforcement.
 */

const OWNER = "guest-owner";
const OTHER_GUEST = "guest-intruder";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

interface FakeProject {
  id: string;
  ownerId: string;
  name: string;
  entryStage: "idea";
  brandState: "unbranded";
  status: "active";
  workflowState: string;
  currentPlanJson: WorkflowPlan | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Store {
  callerOwnerId: string;
  project: FakeProject;
  context: BrandContext;
  version: number;
  turns: InterviewTurn[];
  lockedPaths: string[];
  runs: unknown[];
  output: InterviewerOutput;
  interviewerCalls: number;
}

const store = vi.hoisted(() => ({ current: null as unknown as Store }));

vi.mock("@/lib/session", () => ({
  getOwnerId: async () => store.current.callerOwnerId,
}));

vi.mock("@/lib/agents/interviewer", () => ({
  runInterviewer: async () => {
    store.current.interviewerCalls++;
    return {
      output: store.current.output,
      trace: {
        agent: "interviewer",
        model: "test-fast-model",
        promptVersion: "1.0.0",
        tokensIn: 100,
        tokensOut: 50,
        latencyMs: 20,
        retryCount: 0,
        errorCode: null,
      },
    };
  },
}));

vi.mock("@/lib/db/queries", () => ({
  getProject: async (ownerId: string, id: string) => {
    const { project } = store.current;
    if (project.id !== id || project.ownerId !== ownerId) {
      throw new AppError("NOT_FOUND", { message: "not found for owner" });
    }
    return project;
  },
  getLatestContext: async () => ({ context: store.current.context, version: store.current.version }),
  listInterviewTurns: async () => [...store.current.turns],
  getLockedPaths: async () => store.current.lockedPaths,
  addInterviewTurn: async (input: {
    role: InterviewTurn["role"];
    content: string;
    questionReason?: string | null;
    suggestedAnswers?: string[];
  }) => {
    const turn: InterviewTurn = {
      id: `turn-${store.current.turns.length + 1}`,
      role: input.role,
      content: input.content,
      question_reason: input.questionReason ?? null,
      suggested_answers: input.suggestedAnswers ?? [],
      created_at: new Date().toISOString(),
    };
    store.current.turns.push(turn);
    return turn;
  },
  recordRun: async (input: unknown) => {
    store.current.runs.push(input);
    return "run-1";
  },
  saveContext: async (_projectId: string, context: BrandContext, expectedVersion: number) => {
    if (expectedVersion !== store.current.version) {
      throw new AppError("CONFLICT", { message: "version mismatch" });
    }
    store.current.context = context;
    store.current.version = expectedVersion + 1;
    return { context, version: store.current.version };
  },
  updateProjectWorkflow: async (
    _projectId: string,
    update: { workflowState?: string; plan?: WorkflowPlan; name?: string },
  ) => {
    const project = store.current.project;
    if (update.workflowState) project.workflowState = update.workflowState;
    if (update.plan) project.currentPlanJson = update.plan;
    if (update.name) project.name = update.name;
  },
}));

const { POST } = await import("./route");

const baseOutput: InterviewerOutput = {
  refusal: null,
  known_information: ["An app for students to find teammates"],
  missing_information: ["What goes wrong today"],
  assumptions: ["Users are undergraduates"],
  next_question: "What usually goes wrong when students look for teammates?",
  question_reason: "The failure they feel most is what the brand should fix.",
  suggested_answers: ["Nobody replies", "People drop out"],
  confidence: [
    { path: "problem.statement", level: "medium" },
    { path: "audience.primary", level: "high" },
    { path: "product.description", level: "medium" },
  ],
  extracted_updates: [
    { path: "audience.primary", values: ["College students"], evidence: "college students" },
    {
      path: "product.description",
      values: ["An app for finding reliable teammates"],
      evidence: "an app that helps college students find reliable teammates",
    },
  ],
};

function post(body: unknown, projectId = PROJECT_ID) {
  const request = new NextRequest(`http://localhost/api/projects/${projectId}/interview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id: projectId }) });
}

beforeEach(() => {
  store.current = {
    callerOwnerId: OWNER,
    project: {
      id: PROJECT_ID,
      ownerId: OWNER,
      name: "New idea",
      entryStage: "idea",
      brandState: "unbranded",
      status: "active",
      workflowState: "DISCOVERY",
      currentPlanJson: defaultPlanFor("idea"),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    context: emptyBrandContext({ stage: "idea" }),
    version: 1,
    turns: [],
    lockedPaths: [],
    runs: [],
    output: structuredClone(baseOutput),
    interviewerCalls: 0,
  };
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/projects/[id]/interview", () => {
  it("asks the first question, applies the extracted updates and bumps the version", async () => {
    const response = await post({});
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.turn.content).toBe(baseOutput.next_question);
    expect(body.turn.question_reason).toBe(baseOutput.question_reason);
    expect(body.turn.suggested_answers).toEqual(baseOutput.suggested_answers);
    expect(body.context.audience.primary).toEqual(["College students"]);
    expect(body.version).toBe(2);
    expect(body.complete).toBe(false);
    expect(store.current.runs).toHaveLength(1);
  });

  it("stores the user's answer before the assistant's question", async () => {
    await post({});
    await post({ answer: "Nobody replies in group chats" });

    expect(store.current.turns.map((turn) => turn.role)).toEqual([
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("completes on confidence and advances the workflow to planning", async () => {
    store.current.output = {
      ...baseOutput,
      confidence: [
        { path: "problem.statement", level: "high" },
        { path: "audience.primary", level: "high" },
        { path: "product.description", level: "high" },
      ],
    };

    const body = await (await post({ answer: "Students can't tell who is reliable" })).json();

    expect(body.complete).toBe(true);
    expect(body.completion_reason).toBe("confidence");
    expect(body.turn).toBeNull();
    expect(store.current.project.workflowState).toBe("WORKFLOW_PLANNING");
    expect(
      body.plan.steps.find((step: { module: string }) => step.module === "interviewer").status,
    ).toBe("complete");
    // The next step becomes the current one.
    expect(body.plan.steps[1].status).toBe("running");
  });

  it("completes without a model call when the user says that's enough", async () => {
    const body = await (await post({ skip: true })).json();

    expect(body.complete).toBe(true);
    expect(body.completion_reason).toBe("user_skipped");
    expect(store.current.interviewerCalls).toBe(0);
    expect(store.current.project.workflowState).toBe("WORKFLOW_PLANNING");
  });

  it("stops after six questions", async () => {
    store.current.turns = Array.from({ length: 6 }, (_, index) => ({
      id: `q${index}`,
      role: "assistant" as const,
      content: `Question ${index}`,
      question_reason: "because",
      suggested_answers: [],
      created_at: new Date().toISOString(),
    }));

    const body = await (await post({ answer: "One more thing" })).json();

    expect(body.complete).toBe(true);
    expect(body.completion_reason).toBe("question_limit");
  });

  it("never writes a locked field, even when the model extracts one", async () => {
    store.current.context = {
      ...store.current.context,
      audience: { ...store.current.context.audience, primary: ["Final-year students"] },
    };
    store.current.lockedPaths = ["audience.primary"];

    const body = await (await post({})).json();

    expect(body.context.audience.primary).toEqual(["Final-year students"]);
    expect(body.context.product.description).toBe("An app for finding reliable teammates");
  });

  it("returns a decline without a question when the idea is refused", async () => {
    store.current.output = {
      ...baseOutput,
      refusal: "I can't help with that one. Tell me about a different idea and we'll start there.",
      next_question: "",
      extracted_updates: [],
      confidence: [],
    };

    const body = await (await post({ answer: "something harmful" })).json();

    expect(body.declined).toBe(true);
    expect(body.complete).toBe(false);
    expect(body.turn.content).toContain("I can't help with that one");
    expect(body.turn.question_reason).toBeNull();
  });

  it("does not spend a model call when the open question is simply reloaded", async () => {
    await post({});
    const calls = store.current.interviewerCalls;

    const body = await (await post({})).json();

    expect(store.current.interviewerCalls).toBe(calls);
    expect(body.turn.content).toBe(baseOutput.next_question);
  });

  it("does not store the same answer twice when a failed turn is retried", async () => {
    await post({});
    await post({ answer: "Nobody replies" });
    store.current.turns.pop(); // the assistant turn never made it back to the client

    await post({ answer: "Nobody replies" });

    expect(store.current.turns.filter((turn) => turn.role === "user")).toHaveLength(1);
  });

  it("hides another guest's project behind a 404 and never runs the agent", async () => {
    store.current.callerOwnerId = OTHER_GUEST;

    const response = await post({ answer: "let me in" });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(store.current.interviewerCalls).toBe(0);
    expect(store.current.turns).toEqual([]);
    expect(store.current.version).toBe(1);
  });
});

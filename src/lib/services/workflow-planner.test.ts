import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBrandContext, type BrandContext } from "@/lib/schemas/brand-context";
import { AppError } from "@/lib/schemas/errors";
import type { PlannerOutput } from "@/lib/schemas/outputs/planner";

/*
 * Orchestrator lite: LLM proposes reasons, code validates, one repair, then the
 * static plan (plan §7.3 step 4). The workflow must never block on this call —
 * including while the OpenAI account has no credits.
 */

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  calls: 0,
}));

vi.mock("@/lib/agents/orchestrator", () => ({
  runPlanner: async (input: unknown) => {
    mocks.calls++;
    return mocks.run(input);
  },
}));

const { planWorkflow } = await import("./workflow-planner");
const { defaultPlanFor } = await import("./workflow-engine");

function discoveredContext(): BrandContext {
  const context = emptyBrandContext({ stage: "idea" });
  return {
    ...context,
    problem: { ...context.problem, statement: "Students can't tell who is reliable" },
    audience: { ...context.audience, primary: ["College students"] },
    product: { ...context.product, description: "An app for finding teammates" },
  };
}

const trace = {
  agent: "orchestrator",
  model: "test-fast-model",
  promptVersion: "1.0.0",
  tokensIn: 300,
  tokensOut: 120,
  latencyMs: 40,
  retryCount: 0,
  errorCode: null,
};

function reasonsFor(steps: string[], overrides: Partial<PlannerOutput["steps"][number]> = {}) {
  return {
    output: {
      steps: steps.map((module) => ({
        module,
        reason: `Because ${module} is worth your time.`,
        skip: false,
        skip_reason: "",
        ...overrides,
      })),
    } as PlannerOutput,
    trace,
  };
}

const input = () => ({
  entryStage: "idea" as const,
  plan: defaultPlanFor("idea"),
  context: discoveredContext(),
  lockedPaths: [] as string[],
});

beforeEach(() => {
  mocks.calls = 0;
  mocks.run.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("planWorkflow", () => {
  it("writes the model's reasons into the plan when it validates", async () => {
    const open = defaultPlanFor("idea").steps.map((step) => step.module);
    mocks.run.mockResolvedValue(reasonsFor(open));

    const result = await planWorkflow(input());

    expect(result.fallbackReason).toBeNull();
    expect(result.plan.fallback_used).toBe(false);
    expect(result.plan.reasons_source).toBe("ai");
    expect(result.plan.steps[1]?.reason).toContain("brand_battle is worth your time");
    expect(result.traces).toHaveLength(1);
    expect(mocks.calls).toBe(1);
  });

  it("marks a step skipped when the model says the context already covers it", async () => {
    const open = defaultPlanFor("idea").steps.map((step) => step.module);
    mocks.run.mockResolvedValue({
      output: {
        steps: open.map((module) => ({
          module,
          reason: `Because ${module} helps.`,
          skip: module === "five_worlds",
          skip_reason: "You already decided the identity elsewhere.",
        })),
      },
      trace,
    });

    const result = await planWorkflow(input());

    const worlds = result.plan.steps.find((step) => step.module === "five_worlds");
    expect(worlds?.status).toBe("skipped");
    expect(worlds?.reason).toBe("You already decided the identity elsewhere.");
  });

  it("repairs once when the proposed plan breaks a rule, then accepts it", async () => {
    const open = defaultPlanFor("idea").steps.map((step) => step.module);
    mocks.run
      .mockResolvedValueOnce({
        output: {
          steps: open.map((module) => ({
            module,
            reason: `Because ${module} helps.`,
            // Skipping the only critique step leaves nothing checking the Builder.
            skip: module === "anti_generic",
            skip_reason: "Not needed.",
          })),
        },
        trace,
      })
      .mockResolvedValueOnce(reasonsFor(open));

    const result = await planWorkflow(input());

    expect(mocks.calls).toBe(2);
    expect(result.fallbackReason).toBeNull();
    expect(result.plan.steps.find((step) => step.module === "anti_generic")?.status).toBe("pending");
    // The repair attempt is told what was wrong.
    const second = mocks.run.mock.calls[1]![0] as { previousErrors?: string[] };
    expect(second.previousErrors?.join(" ")).toContain("Anti-Generic");
  });

  it("falls back to the static plan when both attempts stay invalid", async () => {
    const open = defaultPlanFor("idea").steps.map((step) => step.module);
    mocks.run.mockResolvedValue({
      output: {
        steps: open.map((module) => ({
          module,
          reason: `Because ${module} helps.`,
          skip: module === "anti_generic",
          skip_reason: "Not needed.",
        })),
      },
      trace,
    });

    const result = await planWorkflow(input());

    expect(mocks.calls).toBe(2);
    expect(result.plan.fallback_used).toBe(true);
    expect(result.plan.reasons_source).toBe("default");
    expect(result.fallbackReason).toContain("validation");
    expect(result.plan.steps.map((step) => step.status)).toEqual(
      defaultPlanFor("idea").steps.map((step) => step.status),
    );
    expect(result.traces).toHaveLength(2);
  });

  it("falls back, without blocking the workflow, when the account has no credits", async () => {
    mocks.run.mockRejectedValue(
      new AppError("AI_PROVIDER_UNAVAILABLE", { message: "insufficient_quota" }),
    );

    const result = await planWorkflow(input());

    expect(result.plan.fallback_used).toBe(true);
    expect(result.plan.steps[0]?.reason).toContain("we start with your problem");
    expect(result.fallbackReason).toContain("planner call failed");
  });

  it("skips a step the user has locked out of before asking the model", async () => {
    const open = defaultPlanFor("idea").steps.map((step) => step.module);
    mocks.run.mockResolvedValue(reasonsFor(open));

    const result = await planWorkflow({ ...input(), lockedPaths: ["launch"] });

    expect(result.plan.steps.find((step) => step.module === "launch_kit")?.status).toBe("skipped");
  });
});

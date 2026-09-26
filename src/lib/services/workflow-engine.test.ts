import { describe, expect, it } from "vitest";
import { emptyBrandContext, type BrandContext } from "@/lib/schemas/brand-context";
import type { WorkflowPlan } from "@/lib/schemas/workflow";
import {
  canTransition,
  completeStep,
  defaultPlanFor,
  hasContextValue,
  nextRunnableStep,
  setStepStatus,
  skipLockedSteps,
  validatePlan,
} from "./workflow-engine";

/*
 * Plan validator and state machine (plan §7.3, I12, I14).
 */

/** A context where discovery has happened, so the Battle's requires are met. */
function discoveredContext(): BrandContext {
  const context = emptyBrandContext({ stage: "idea" });
  return {
    ...context,
    problem: { ...context.problem, statement: "Students can't tell who is reliable" },
    audience: { ...context.audience, primary: ["College students"] },
    product: { ...context.product, description: "An app for finding teammates" },
  };
}

function planOf(
  modules: Array<[string, string?]>,
  overrides: Partial<WorkflowPlan> = {},
): WorkflowPlan {
  return {
    steps: modules.map(([module, status]) => ({
      module: module as WorkflowPlan["steps"][number]["module"],
      reason: "Because it helps.",
      status: (status ?? "pending") as WorkflowPlan["steps"][number]["status"],
    })),
    fallback_used: false,
    reasons_source: "ai",
    ...overrides,
  };
}

describe("default plans", () => {
  it("sends the interview straight into the Brand Battle for an idea (ADR-018, ADR-023)", () => {
    const plan = defaultPlanFor("idea");
    expect(plan.steps.map((step) => step.module)).toEqual([
      "interviewer",
      "brand_battle",
      "battle_critique",
      "five_worlds",
      "anti_generic",
      "brand_builder",
      "launch_kit",
    ]);
    expect(plan.steps[0]?.status).toBe("running");
    expect(plan.reasons_source).toBe("default");
  });

  it("validates every stage's default plan once discovery has happened", () => {
    for (const stage of ["idea", "product", "brand", "protect"] as const) {
      const result = validatePlan({
        plan: defaultPlanFor(stage),
        context: discoveredContext(),
        lockedPaths: [],
      });
      expect(result, `${stage}: ${result.errors.join("; ")}`).toMatchObject({ valid: true });
    }
  });
});

describe("validatePlan", () => {
  const context = discoveredContext();

  it("accepts a plan whose requirements are met in order", () => {
    const plan = planOf([
      ["brand_battle"],
      ["battle_critique"],
      ["anti_generic"],
      ["brand_builder"],
      ["launch_kit"],
    ]);
    expect(validatePlan({ plan, context, lockedPaths: [] })).toEqual({ valid: true, errors: [] });
  });

  it("rejects a step that writes a locked path", () => {
    // Since ADR-023 the positioning is written by the decision at the end of
    // the critique step, so that is the step a positioning lock blocks.
    const plan = planOf([["brand_battle"], ["battle_critique"]]);
    const result = validatePlan({ plan, context, lockedPaths: ["positioning.statement"] });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("positioning.statement");
  });

  it("lets the generation step run even when the positioning is locked", () => {
    // Generating proposals writes nothing, so it is never blocked by a lock.
    const plan = planOf([["brand_battle"]]);
    expect(validatePlan({ plan, context, lockedPaths: ["positioning"] }).valid).toBe(true);
  });

  it("rejects the Launch Kit before the Brand Builder", () => {
    const plan = planOf([
      ["brand_battle"],
      ["battle_critique"],
      ["anti_generic"],
      ["launch_kit"],
      ["brand_builder"],
    ]);
    const result = validatePlan({ plan, context, lockedPaths: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("Launch Kit cannot run before");
  });

  it("rejects finalising the brand with nothing checking the work first", () => {
    const plan = planOf([["brand_battle"], ["battle_critique"], ["brand_builder"], ["launch_kit"]]);
    const result = validatePlan({ plan, context, lockedPaths: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("Anti-Generic");
  });

  it("rejects a step whose inputs nothing provides", () => {
    // five_worlds needs a positioning statement, which no earlier step writes here.
    const plan = planOf([["five_worlds"], ["anti_generic"], ["brand_builder"]]);
    const result = validatePlan({ plan, context, lockedPaths: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("positioning.statement");
  });

  it("rejects an unknown module and a step with no reason", () => {
    const plan = planOf([["brand_battle"]]);
    plan.steps.push({
      module: "mystery_module" as never,
      reason: "",
      status: "pending",
    });
    plan.steps[0]!.reason = "  ";
    const result = validatePlan({ plan, context, lockedPaths: [] });
    expect(result.errors.some((error) => error.includes("not a known module"))).toBe(true);
    expect(result.errors.some((error) => error.includes("no reason"))).toBe(true);
  });

  it("ignores the requirements of a skipped step", () => {
    const plan = planOf([
      ["five_worlds", "skipped"],
      ["anti_generic"],
      ["brand_builder"],
    ]);
    // anti_generic still needs positioning.statement, which five_worlds does not produce.
    const result = validatePlan({ plan, context, lockedPaths: [] });
    expect(result.errors.some((error) => error.includes("five_worlds"))).toBe(false);
  });
});

describe("skipLockedSteps", () => {
  it("skips a module whose every output the user locked, so the fallback still validates", () => {
    const plan = defaultPlanFor("idea");
    const locked = ["launch"];
    const skipped = skipLockedSteps(plan, locked);
    const launch = skipped.steps.find((step) => step.module === "launch_kit");
    expect(launch?.status).toBe("skipped");
    expect(validatePlan({ plan: skipped, context: discoveredContext(), lockedPaths: locked }).valid).toBe(
      true,
    );
  });

  it("leaves a module alone when only some of its outputs are locked", () => {
    const skipped = skipLockedSteps(defaultPlanFor("idea"), ["positioning.statement"]);
    // brand_battle also writes selected_direction, so it still has work to do.
    expect(skipped.steps.find((step) => step.module === "brand_battle")?.status).toBe("pending");
  });
});

describe("plan progress", () => {
  it("hands the turn to the next step when one completes", () => {
    const plan = completeStep(defaultPlanFor("idea"), "interviewer");
    expect(plan.steps[0]?.status).toBe("complete");
    expect(plan.steps[1]?.status).toBe("running");
    expect(nextRunnableStep(plan)?.module).toBe("brand_battle");
  });

  it("flows from the Battle's generation step into its critique (ADR-023)", () => {
    let plan = completeStep(defaultPlanFor("idea"), "interviewer");
    plan = completeStep(plan, "brand_battle");
    expect(nextRunnableStep(plan)?.module).toBe("battle_critique");
  });

  it("re-runs a failed step before moving on, so Try Again repeats only that call", () => {
    let plan = completeStep(defaultPlanFor("idea"), "interviewer");
    plan = completeStep(plan, "brand_battle");
    plan = setStepStatus(plan, "battle_critique", "failed");

    expect(nextRunnableStep(plan)?.module).toBe("battle_critique");
  });

  it("skips past a step awaiting a decision rather than running it again", () => {
    let plan = completeStep(defaultPlanFor("idea"), "interviewer");
    plan = completeStep(plan, "brand_battle");
    plan = setStepStatus(plan, "battle_critique", "awaiting_decision");

    expect(nextRunnableStep(plan)?.module).toBe("five_worlds");
  });
});

describe("workflow state machine", () => {
  it("allows the phases the workflow actually walks through", () => {
    expect(canTransition("DISCOVERY", "WORKFLOW_PLANNING")).toBe(true);
    expect(canTransition("WORKFLOW_PLANNING", "POSITIONING")).toBe(true);
    // The Battle's two steps: generation, then the critique (ADR-023).
    expect(canTransition("POSITIONING", "CRITIQUE")).toBe(true);
    expect(canTransition("CRITIQUE", "USER_DECISION")).toBe(true);
    expect(canTransition("POSITIONING", "USER_DECISION")).toBe(true);
    expect(canTransition("USER_DECISION", "WORKFLOW_PLANNING")).toBe(true);
    expect(canTransition("POSITIONING", "POSITIONING")).toBe(true);
  });

  it("refuses to jump straight from discovery to launch", () => {
    expect(canTransition("DISCOVERY", "LAUNCH")).toBe(false);
    expect(canTransition("INITIAL", "BRAND_BUILDING")).toBe(false);
  });
});

describe("hasContextValue", () => {
  it("treats empty strings and arrays as missing", () => {
    const context = emptyBrandContext();
    expect(hasContextValue(context, "problem.statement")).toBe(false);
    expect(hasContextValue(context, "audience.primary")).toBe(false);
    expect(hasContextValue(discoveredContext(), "audience.primary")).toBe(true);
    expect(hasContextValue(context, "nothing.here")).toBe(false);
  });
});

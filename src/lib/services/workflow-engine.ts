import { CRITIQUE_MODULES, MODULE_REGISTRY, moduleSpec } from "@/lib/agents/registry";
import type { BrandContext } from "@/lib/schemas/brand-context";
import { AppError } from "@/lib/schemas/errors";
import {
  MODULE_NAMES,
  type EntryStage,
  type ModuleName,
  type PlanStep,
  type WorkflowPlan,
  type WorkflowState,
} from "@/lib/schemas/workflow";

/*
 * Workflow engine, hackathon build (plan §7.3 "orchestrator lite", §7.5).
 * The LLM writes the reasons; this file owns the plan itself: the static
 * defaults, the validator, the fallback and the state machine (I1, I5, I14).
 * Client-safe: the sidebar imports the labels and the plan helpers.
 */

export { MODULE_LABELS } from "@/lib/agents/registry";

/**
 * Default plans per entry stage (plan §7.5). Reasons are the fallback text when
 * the AI reasons call is unavailable; they are written for the user.
 */
const DEFAULT_PLANS: Record<EntryStage, ReadonlyArray<{ module: ModuleName; reason: string }>> = {
  idea: [
    { module: "interviewer", reason: "We know almost nothing yet, so we start with your problem and who has it." },
    { module: "brand_battle", reason: "Several positionings are usually defensible, so we make them compete instead of guessing." },
    { module: "five_worlds", reason: "One strategy can become very different brands; you should see the range before choosing." },
    { module: "anti_generic", reason: "First drafts drift towards safe, generic language. This step attacks that." },
    { module: "brand_builder", reason: "Your decisions become one consistent Brand System." },
    { module: "launch_kit", reason: "You leave with copy you can actually publish." },
  ],
  product: [
    { module: "interviewer", reason: "We need what your product really does before we talk about branding." },
    { module: "brand_doctor", reason: "Your current messaging is diagnosed for gaps and contradictions." },
    { module: "brand_battle", reason: "Competing positionings show which claim is strongest for your audience." },
    { module: "anti_generic", reason: "Product copy is where clichés hide; we challenge them." },
    { module: "brand_builder", reason: "Your decisions become one consistent Brand System." },
    { module: "launch_kit", reason: "You leave with copy you can actually publish." },
  ],
  brand: [
    { module: "brand_doctor", reason: "We start by diagnosing what your brand says today and where it contradicts itself." },
    { module: "brand_battle", reason: "Alternative strategic directions show what a stronger version could look like." },
    { module: "five_worlds", reason: "Identity options make the change concrete instead of abstract." },
    { module: "anti_generic", reason: "We check the new language is sharper than what you had." },
    { module: "brand_builder", reason: "The chosen direction becomes a documented Brand System." },
    { module: "consistency_guardian", reason: "Future content is checked against the rebuilt brand." },
  ],
  protect: [
    { module: "brand_doctor", reason: "We read your existing material and draft the brand rules it implies." },
    { module: "consistency_guardian", reason: "Once you confirm those rules, every new piece of content is checked against them." },
  ],
};

/** The stored plan for a new project: first step running, the rest pending. */
export function defaultPlanFor(stage: EntryStage): WorkflowPlan {
  const steps: PlanStep[] = DEFAULT_PLANS[stage].map((step, index) => ({
    module: step.module,
    reason: step.reason,
    status: index === 0 ? "running" : "pending",
  }));
  return { steps, fallback_used: true, reasons_source: "default" };
}

export function currentStep(plan: WorkflowPlan): PlanStep | null {
  return plan.steps.find((step) => step.status === "running") ?? null;
}

/** The next step to execute: the running one, else the first pending one. */
export function nextRunnableStep(plan: WorkflowPlan): PlanStep | null {
  return (
    plan.steps.find((step) => step.status === "running") ??
    plan.steps.find((step) => step.status === "pending") ??
    null
  );
}

export function planHasModule(plan: WorkflowPlan, module: ModuleName): boolean {
  return plan.steps.some((step) => step.module === module);
}

/**
 * Marks `module` complete and starts the next pending step.
 * Returns the same plan object when nothing changes, so callers can skip the write.
 */
export function completeStep(plan: WorkflowPlan, module: ModuleName): WorkflowPlan {
  const index = plan.steps.findIndex((step) => step.module === module);
  if (index === -1 || plan.steps[index]!.status === "complete") return plan;

  const steps = plan.steps.map((step, i) =>
    i === index ? { ...step, status: "complete" as const } : step,
  );
  const next = steps.findIndex((step) => step.status === "pending");
  if (next !== -1) steps[next] = { ...steps[next]!, status: "running" };
  return { ...plan, steps };
}

/** Sets one step's status without touching the others (e.g. awaiting_decision, failed). */
export function setStepStatus(
  plan: WorkflowPlan,
  module: ModuleName,
  status: PlanStep["status"],
): WorkflowPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => (step.module === module ? { ...step, status } : step)),
  };
}

/* ------------------------------------------------------------------ *
 * Context helpers
 * ------------------------------------------------------------------ */

/** Reads a dotted Brand Context path. Unknown paths read as undefined, not a throw. */
export function readContextPath(context: BrandContext, path: string): unknown {
  let current: unknown = context;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** True when the path holds real content: a non-empty string, a non-empty array or an object. */
export function hasContextValue(context: BrandContext, path: string): boolean {
  const value = readContextPath(context, path);
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/* ------------------------------------------------------------------ *
 * Plan validation (plan §7.3 step 3)
 * ------------------------------------------------------------------ */

export interface PlanValidationResult {
  valid: boolean;
  /** One line per problem, written for the repair prompt. */
  errors: string[];
}

export interface ValidatePlanInput {
  plan: WorkflowPlan;
  context: BrandContext;
  lockedPaths: readonly string[];
}

function isLocked(path: string, lockedPaths: readonly string[]): boolean {
  return lockedPaths.some((locked) => path === locked || path.startsWith(`${locked}.`));
}

/**
 * Code validator for a proposed plan. Checks, in plan §7.3 order:
 * every module exists · requires are satisfiable when the step runs · no step
 * writes a locked path · Brand Builder before Launch Kit · a critique or
 * consistency step before the Brand Builder finalises the brand.
 */
export function validatePlan(input: ValidatePlanInput): PlanValidationResult {
  const { plan, context, lockedPaths } = input;
  const errors: string[] = [];

  if (plan.steps.length === 0) {
    return { valid: false, errors: ["The plan has no steps."] };
  }

  const seen = new Set<ModuleName>();
  // Paths already satisfied: everything the context holds now.
  const available = new Set<string>();
  for (const spec of Object.values(MODULE_REGISTRY)) {
    for (const path of [...spec.requires, ...spec.produces]) {
      if (hasContextValue(context, path)) available.add(path);
    }
  }

  for (const [index, step] of plan.steps.entries()) {
    if (!(MODULE_NAMES as readonly string[]).includes(step.module)) {
      errors.push(`Step ${index + 1}: "${step.module}" is not a known module.`);
      continue;
    }
    if (seen.has(step.module) && step.status !== "skipped") {
      errors.push(`Step ${index + 1}: ${step.module} is repeated without a stated reason.`);
    }
    seen.add(step.module);

    const spec = moduleSpec(step.module);
    if (!step.reason.trim()) {
      errors.push(`Step ${index + 1}: ${step.module} has no reason for the user.`);
    }

    if (step.status !== "skipped") {
      for (const required of spec.requires) {
        if (!available.has(required)) {
          errors.push(
            `Step ${index + 1}: ${step.module} needs "${required}", which nothing before it provides.`,
          );
        }
      }
      for (const produced of spec.produces) {
        if (isLocked(produced, lockedPaths)) {
          errors.push(
            `Step ${index + 1}: ${step.module} would write "${produced}", which the user locked.`,
          );
        }
        available.add(produced);
      }
    }
  }

  const activeIndex = (module: ModuleName) =>
    plan.steps.findIndex((step) => step.module === module && step.status !== "skipped");

  const builder = activeIndex("brand_builder");
  const launch = activeIndex("launch_kit");
  if (builder !== -1 && launch !== -1 && launch < builder) {
    errors.push("The Launch Kit cannot run before the Brand Builder.");
  }
  if (builder !== -1) {
    const critique = CRITIQUE_MODULES.map(activeIndex).filter((index) => index !== -1);
    if (critique.length === 0 || Math.min(...critique) > builder) {
      errors.push(
        "Nothing checks the work before the Brand Builder finalises it: add Anti-Generic or a consistency check before it.",
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Marks steps the user has locked out of, so the static fallback always
 * validates: a module whose every output is locked has nothing left to do.
 */
export function skipLockedSteps(plan: WorkflowPlan, lockedPaths: readonly string[]): WorkflowPlan {
  if (lockedPaths.length === 0) return plan;
  return {
    ...plan,
    steps: plan.steps.map((step) => {
      const spec = moduleSpec(step.module);
      if (spec.produces.length === 0 || step.status === "complete") return step;
      const allLocked = spec.produces.every((path) => isLocked(path, lockedPaths));
      return allLocked ? { ...step, status: "skipped" as const } : step;
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Workflow state machine (I14)
 * ------------------------------------------------------------------ */

const ALLOWED_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  INITIAL: ["DISCOVERY", "CONTEXT_BUILDING", "WORKFLOW_PLANNING", "ANALYSIS"],
  DISCOVERY: ["DISCOVERY", "CONTEXT_BUILDING", "WORKFLOW_PLANNING"],
  CONTEXT_BUILDING: ["WORKFLOW_PLANNING", "DISCOVERY"],
  WORKFLOW_PLANNING: [
    "ANALYSIS",
    "POSITIONING",
    "EXPLORATION",
    "CRITIQUE",
    "BRAND_BUILDING",
    "CONSISTENCY_CHECK",
    "DISCOVERY",
    "WORKFLOW_PLANNING",
  ],
  ANALYSIS: ["WORKFLOW_PLANNING", "POSITIONING", "USER_DECISION", "CRITIQUE"],
  POSITIONING: ["USER_DECISION", "WORKFLOW_PLANNING", "EXPLORATION", "CRITIQUE", "POSITIONING"],
  EXPLORATION: ["USER_DECISION", "WORKFLOW_PLANNING", "CRITIQUE", "EXPLORATION"],
  CRITIQUE: ["USER_DECISION", "WORKFLOW_PLANNING", "BRAND_BUILDING", "CRITIQUE"],
  USER_DECISION: [
    "WORKFLOW_PLANNING",
    "POSITIONING",
    "EXPLORATION",
    "CRITIQUE",
    "BRAND_BUILDING",
    "ANALYSIS",
  ],
  BRAND_BUILDING: ["QUALITY_CHECK", "USER_DECISION", "WORKFLOW_PLANNING", "LAUNCH"],
  QUALITY_CHECK: ["BRAND_BUILDING", "LAUNCH", "WORKFLOW_PLANNING", "ACTIVE_BRAND"],
  LAUNCH: ["ACTIVE_BRAND", "WORKFLOW_PLANNING", "CONSISTENCY_CHECK"],
  ACTIVE_BRAND: ["CONSISTENCY_CHECK", "WORKFLOW_PLANNING"],
  CONSISTENCY_CHECK: ["ACTIVE_BRAND", "WORKFLOW_PLANNING", "CONSISTENCY_CHECK"],
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return from === to || (ALLOWED_TRANSITIONS[from]?.includes(to) ?? false);
}

/** Throws rather than writing a state the machine doesn't allow (I14). */
export function assertTransition(from: WorkflowState, to: WorkflowState): void {
  if (!canTransition(from, to)) {
    throw new AppError("CONFLICT", {
      message: `Illegal workflow transition ${from} -> ${to}`,
      publicMessage: "This project moved on somewhere else. Refresh to see the latest state.",
    });
  }
}

/** The state a module runs in (I14). */
export function stateForModule(module: ModuleName): WorkflowState {
  return moduleSpec(module).state;
}

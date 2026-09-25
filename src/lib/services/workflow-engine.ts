import {
  type EntryStage,
  type ModuleName,
  type PlanStep,
  type WorkflowPlan,
} from "@/lib/schemas/workflow";

/*
 * Workflow engine, hackathon build (plan §7.3 "orchestrator lite", §7.5).
 * Phase 2 stores the default plan for the entry stage with static reasons;
 * Phase 3 replaces the reasons with one MODEL_FAST call and keeps this file as
 * the validated fallback. Client-safe: the Workflow Sidebar imports the labels.
 */

/** Short names for the sidebar. The user never sees module ids. */
export const MODULE_LABELS: Record<ModuleName, string> = {
  interviewer: "Understand your idea",
  brand_doctor: "Diagnose the brand",
  brand_battle: "Compete strategic directions",
  audience_shifter: "Reframe the audience",
  five_worlds: "Explore identities",
  anti_generic: "Challenge generic language",
  brand_builder: "Build the Brand System",
  launch_kit: "Prepare the launch",
  consistency_guardian: "Guard consistency",
};

/**
 * Default plans per entry stage (plan §7.5). Reasons are written for the user
 * and are what the Workflow Sidebar shows under each step.
 * TODO(I2): Phase 3 replaces these reasons with an AI-written line per step.
 */
const DEFAULT_PLANS: Record<EntryStage, ReadonlyArray<{ module: ModuleName; reason: string }>> = {
  idea: [
    { module: "interviewer", reason: "We know almost nothing yet, so we start with your problem and who has it." },
    { module: "audience_shifter", reason: "Early ideas often aim at the wrong people first; we test other readings of your audience." },
    { module: "brand_battle", reason: "Several positionings are usually defensible, so we make them compete instead of guessing." },
    { module: "five_worlds", reason: "One strategy can become very different brands; you should see the range before choosing." },
    { module: "anti_generic", reason: "First drafts drift towards safe, generic language. This step attacks that." },
    { module: "brand_builder", reason: "Your decisions become one consistent Brand System." },
    { module: "launch_kit", reason: "You leave with copy you can actually publish." },
  ],
  product: [
    { module: "interviewer", reason: "We need what your product really does before we talk about branding." },
    { module: "brand_doctor", reason: "Your current messaging is diagnosed for gaps and contradictions." },
    { module: "audience_shifter", reason: "Products often sell better to an adjacent audience than the obvious one." },
    { module: "brand_battle", reason: "Competing positionings show which claim is strongest for that audience." },
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
  return { steps, fallback_used: true };
}

export function currentStep(plan: WorkflowPlan): PlanStep | null {
  return plan.steps.find((step) => step.status === "running") ?? null;
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

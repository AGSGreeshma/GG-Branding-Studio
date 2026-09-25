import "server-only";
import { runPlanner } from "@/lib/agents/orchestrator";
import type { LlmTrace } from "@/lib/ai/types";
import type { BrandContext } from "@/lib/schemas/brand-context";
import type { PlannerOutput } from "@/lib/schemas/outputs/planner";
import type { EntryStage, PlanStep, WorkflowPlan } from "@/lib/schemas/workflow";
import { describeError, logEvent } from "./log";
import { skipLockedSteps, validatePlan } from "./workflow-engine";

/*
 * Orchestrator lite, service half (plan §7.3 steps 2–4, I2/I12).
 * LLM proposes the reasons → code validates → one repair attempt → static
 * fallback. The workflow can never block on this call: any failure, including
 * an exhausted OpenAI quota, falls back to the stored plan with its default
 * reasons and `fallback_used: true`.
 */

export interface PlanWorkflowInput {
  entryStage: EntryStage;
  plan: WorkflowPlan;
  context: BrandContext;
  lockedPaths: readonly string[];
}

export interface PlanWorkflowResult {
  plan: WorkflowPlan;
  /** Every model call made, for workflow_runs. */
  traces: LlmTrace[];
  /** Why the fallback was used, for the log and the sidebar. */
  fallbackReason: string | null;
}

/** Steps the planner may comment on: everything not already finished. */
function openSteps(plan: WorkflowPlan): PlanStep[] {
  return plan.steps.filter((step) => step.status !== "complete");
}

/** Merges the model's reasons into the stored plan. Finished steps keep theirs. */
export function applyPlanReasons(plan: WorkflowPlan, output: PlannerOutput): WorkflowPlan {
  const byModule = new Map(output.steps.map((step) => [step.module, step]));
  const steps = plan.steps.map((step) => {
    if (step.status === "complete") return step;
    const written = byModule.get(step.module);
    if (!written) return step;
    const reason = written.reason.trim() || step.reason;
    // A skipped step keeps a reason the user can read: why it wasn't needed.
    if (written.skip && step.status === "pending") {
      return {
        ...step,
        status: "skipped" as const,
        reason: written.skip_reason.trim() || reason,
      };
    }
    return { ...step, reason };
  });

  // Skipping the running step hands the turn to the next one.
  if (!steps.some((step) => step.status === "running")) {
    const next = steps.findIndex((step) => step.status === "pending");
    if (next !== -1) steps[next] = { ...steps[next]!, status: "running" };
  }
  return { ...plan, steps, fallback_used: false, reasons_source: "ai" };
}

function staticFallback(plan: WorkflowPlan, lockedPaths: readonly string[]): WorkflowPlan {
  return { ...skipLockedSteps(plan, lockedPaths), fallback_used: true, reasons_source: "default" };
}

/**
 * Writes the user-facing reasons for a plan, validating the result and falling
 * back to the static plan when the model is unavailable or keeps producing an
 * invalid plan (plan §7.3 step 4).
 */
export async function planWorkflow(input: PlanWorkflowInput): Promise<PlanWorkflowResult> {
  const { entryStage, context, lockedPaths } = input;
  const base = skipLockedSteps(input.plan, lockedPaths);
  const traces: LlmTrace[] = [];

  const baseCheck = validatePlan({ plan: base, context, lockedPaths });
  if (!baseCheck.valid) {
    // The stored plan itself is already impossible: nothing the model writes can fix it.
    logEvent("warn", "plan.default_invalid", { errors: baseCheck.errors.join(" | ") });
  }

  let previousErrors: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output, trace } = await runPlanner({
        entryStage,
        steps: openSteps(base),
        context,
        previousErrors,
      });
      traces.push(trace);

      const proposed = applyPlanReasons(base, output);
      const check = validatePlan({ plan: proposed, context, lockedPaths });
      if (check.valid) {
        logEvent("info", "plan.accepted", { attempt: attempt + 1, steps: proposed.steps.length });
        return { plan: proposed, traces, fallbackReason: null };
      }

      logEvent("warn", "plan.invalid", { attempt: attempt + 1, errors: check.errors.join(" | ") });
      previousErrors = check.errors;
    } catch (err) {
      // Includes an exhausted quota: the workflow must not block on the reasons.
      logEvent("warn", "plan.call_failed", describeError(err));
      return {
        plan: staticFallback(base, lockedPaths),
        traces,
        fallbackReason: "the planner call failed",
      };
    }
  }

  return {
    plan: staticFallback(base, lockedPaths),
    traces,
    fallbackReason: "the proposed plan did not pass validation",
  };
}

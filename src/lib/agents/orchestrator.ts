import "server-only";
import { generateStructured } from "@/lib/ai/llm";
import type { LlmTrace } from "@/lib/ai/types";
import * as prompt from "@/lib/prompts/planner";
import type { BrandContext } from "@/lib/schemas/brand-context";
import type { PlannerOutput } from "@/lib/schemas/outputs/planner";
import type { EntryStage, PlanStep } from "@/lib/schemas/workflow";
import { hasContextValue } from "@/lib/services/workflow-engine";
import { moduleSpec } from "./registry";

/*
 * Orchestrator lite (plan §7.3, ADR-008). Pure: it writes the reasons for a
 * plan the code already built and flags steps whose output the context holds.
 * Validation, repair and fallback live in services/workflow-planner.ts.
 */

export interface PlannerInput {
  entryStage: EntryStage;
  steps: PlanStep[];
  context: BrandContext;
  /** Validation errors from a previous attempt, for the one repair try. */
  previousErrors?: string[];
}

export interface PlannerResult {
  output: PlannerOutput;
  trace: LlmTrace;
}

function contextSummary(context: BrandContext, steps: PlanStep[]) {
  const paths = new Set<string>();
  for (const step of steps) {
    for (const path of moduleSpec(step.module).produces) {
      if (hasContextValue(context, path)) paths.add(path);
    }
  }
  return {
    problem: context.problem.statement,
    audience: context.audience.primary,
    product: context.product.description,
    positioning: context.positioning.statement,
    filled_paths: [...paths],
    assumptions: context.meta.assumptions,
  };
}

export async function runPlanner(input: PlannerInput): Promise<PlannerResult> {
  const producesByModule = Object.fromEntries(
    input.steps.map((step) => [step.module, moduleSpec(step.module).produces]),
  );

  const user = prompt.buildUser({
    entryStage: input.entryStage,
    steps: input.steps,
    contextSummary: contextSummary(input.context, input.steps),
    producesByModule,
  });

  const withErrors = input.previousErrors?.length
    ? [
        user,
        "",
        "<plan_problems>",
        ...input.previousErrors.map((error) => `- ${error}`),
        "</plan_problems>",
        "Your previous answer produced an invalid plan. Do not skip a step that later steps depend on.",
      ].join("\n")
    : user;

  const { result, trace } = await generateStructured({
    agent: prompt.meta.agent,
    schema: prompt.meta.schema,
    system: prompt.system,
    prompt: withErrors,
    tier: prompt.meta.tier,
    temperature: prompt.meta.temperature,
    maxTokens: prompt.meta.maxTokens,
    promptVersion: prompt.PROMPT_VERSION,
  });

  return { output: result, trace };
}

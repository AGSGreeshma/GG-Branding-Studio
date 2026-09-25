import { z } from "zod";
import { ModuleNameSchema } from "../workflow";

/*
 * Orchestrator "lite" output (plan §7.3 hackathon note, I2).
 * The model does not choose the modules — it explains the plan the code built
 * and may mark a step as already covered. Strict-mode friendly: flat, all
 * required, small enums.
 */

export const PlanReasonSchema = z.object({
  module: ModuleNameSchema,
  /** One short sentence for the user, in the sidebar. */
  reason: z.string(),
  /** True when the Brand Context already holds what this step would produce. */
  skip: z.boolean(),
  /** Why it can be skipped. Empty when skip is false. */
  skip_reason: z.string(),
});
export type PlanReason = z.infer<typeof PlanReasonSchema>;

export const PlannerOutputSchema = z.object({
  steps: z.array(PlanReasonSchema),
});
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

import { z } from "zod";

/** Where the user says they are on the landing page (plan §5, §8). */
export const ENTRY_STAGES = ["idea", "product", "brand", "protect"] as const;
export const EntryStageSchema = z.enum(ENTRY_STAGES);
export type EntryStage = z.infer<typeof EntryStageSchema>;

/** Starting brand state derived from the entry stage (plan §5). */
export const BRAND_STATES = [
  "unbranded",
  "product_without_strong_brand",
  "existing_brand",
  "active_brand",
] as const;
export const BrandStateSchema = z.enum(BRAND_STATES);
export type BrandState = z.infer<typeof BrandStateSchema>;

export const ENTRY_STAGE_TO_BRAND_STATE: Record<EntryStage, BrandState> = {
  idea: "unbranded",
  product: "product_without_strong_brand",
  brand: "existing_brand",
  protect: "active_brand",
};

/** Workflow states (plan §16). Transition rules live in services/workflow-engine.ts (I14). */
export const WORKFLOW_STATES = [
  "INITIAL",
  "DISCOVERY",
  "CONTEXT_BUILDING",
  "WORKFLOW_PLANNING",
  "ANALYSIS",
  "POSITIONING",
  "EXPLORATION",
  "CRITIQUE",
  "USER_DECISION",
  "BRAND_BUILDING",
  "QUALITY_CHECK",
  "LAUNCH",
  "ACTIVE_BRAND",
  "CONSISTENCY_CHECK",
] as const;
export const WorkflowStateSchema = z.enum(WORKFLOW_STATES);
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

/** The capability modules the orchestrator can schedule (plan §4). */
export const MODULE_NAMES = [
  "interviewer",
  "brand_doctor",
  "brand_battle",
  "audience_shifter",
  "five_worlds",
  "anti_generic",
  "brand_builder",
  "launch_kit",
  "consistency_guardian",
] as const;
export const ModuleNameSchema = z.enum(MODULE_NAMES);
export type ModuleName = z.infer<typeof ModuleNameSchema>;

export const PLAN_STEP_STATUSES = [
  "pending",
  "running",
  "awaiting_decision",
  "complete",
  "skipped",
  "failed",
] as const;
export const PlanStepStatusSchema = z.enum(PLAN_STEP_STATUSES);
export type PlanStepStatus = z.infer<typeof PlanStepStatusSchema>;

/** One step of the orchestrator plan. `reason` is the AI-written explanation shown in the sidebar. */
export const PlanStepSchema = z.object({
  module: ModuleNameSchema,
  reason: z.string(),
  status: PlanStepStatusSchema,
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

/** Stored in projects.current_plan_json and sent in the `workflow.planned` event (plan §18.4). */
export const WorkflowPlanSchema = z.object({
  steps: z.array(PlanStepSchema),
  fallback_used: z.boolean(),
});
export type WorkflowPlan = z.infer<typeof WorkflowPlanSchema>;

export const PROJECT_STATUSES = ["active", "archived"] as const;
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

import { z } from "zod";
import { BrandContextSchema } from "./brand-context";
import {
  BrandStateSchema,
  EntryStageSchema,
  ProjectStatusSchema,
  WorkflowPlanSchema,
  WorkflowStateSchema,
  type EntryStage,
} from "./workflow";

/**
 * Body of POST /api/projects (plan §8, §18.3). The landing page sends only the
 * stage; name and description are filled in later by the Interviewer.
 */
export const CreateProjectInputSchema = z.object({
  entry_stage: EntryStageSchema,
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

/** Working title until the Interviewer learns the real one. */
export const DEFAULT_PROJECT_NAME: Record<EntryStage, string> = {
  idea: "New idea",
  product: "My product",
  brand: "My brand",
  protect: "Brand protection",
};

/** A project as the client sees it. Dates are ISO strings. */
export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  entry_stage: EntryStageSchema,
  brand_state: BrandStateSchema,
  status: ProjectStatusSchema,
  workflow_state: WorkflowStateSchema,
  plan: WorkflowPlanSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const CreateProjectResponseSchema = z.object({
  project: ProjectSummarySchema,
  context: BrandContextSchema,
  version: z.number().int().positive(),
});
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;

import "server-only";
import type { ProjectSummary } from "@/lib/schemas/project";
import type { Project } from "./schema";

/** DB row -> the client-facing project shape (plan §18.2: routes stay thin). */
export function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    entry_stage: project.entryStage,
    brand_state: project.brandState,
    status: project.status,
    workflow_state: project.workflowState,
    plan: project.currentPlanJson ?? null,
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  };
}

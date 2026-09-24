import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { BrandContext } from "../schemas/brand-context";
import {
  BRAND_STATES,
  ENTRY_STAGES,
  MODULE_NAMES,
  PROJECT_STATUSES,
  WORKFLOW_STATES,
  type WorkflowPlan,
} from "../schemas/workflow";

/*
 * Hackathon tables (plan §17, including the "Added" fields needed now).
 * - No `users` table: guest mode uses projects.owner_id = gg_uid cookie (ADR-005).
 * - No `sources` table yet: file/website input (S) is post-hackathon.
 * - Enums are TypeScript-level (`text` with `enum`) so `db:push` never has to alter Postgres enum types.
 * - Every child row cascades when its project is deleted.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const RUN_STATUSES = ["running", "succeeded", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    entryStage: text("entry_stage", { enum: ENTRY_STAGES }).notNull(),
    brandState: text("brand_state", { enum: BRAND_STATES }).notNull(),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
    workflowState: text("workflow_state", { enum: WORKFLOW_STATES }).notNull().default("INITIAL"),
    currentPlanJson: jsonb("current_plan_json").$type<WorkflowPlan>(),
    shareSlug: text("share_slug").unique(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("projects_owner_id_idx").on(t.ownerId, t.createdAt)],
);

/** Append-only: every write inserts version N+1. The latest row is the current context. */
export const brandContext = pgTable(
  "brand_context",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    contextJson: jsonb("context_json").$type<BrandContext>().notNull(),
    version: integer("version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("brand_context_project_version_uq").on(t.projectId, t.version)],
);

/** One row per model call or module run. Feeds the "How the AI worked" drawer (F9, E11). */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentRunId: uuid("parent_run_id").references((): AnyPgColumn => workflowRuns.id, {
      onDelete: "cascade",
    }),
    module: text("module", { enum: MODULE_NAMES }),
    stage: text("stage", { enum: WORKFLOW_STATES }),
    status: text("status", { enum: RUN_STATUSES }).notNull(),
    agent: text("agent").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    latencyMs: integer("latency_ms"),
    retryCount: integer("retry_count").notNull().default(0),
    errorCode: text("error_code"),
    evaluationJson: jsonb("evaluation_json"),
    inputContext: jsonb("input_context"),
    outputContext: jsonb("output_context"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("workflow_runs_project_idx").on(t.projectId, t.createdAt),
    index("workflow_runs_parent_idx").on(t.parentRunId),
  ],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Dotted Brand Context path, e.g. "identity.tagline". */
    path: text("path").notNull(),
    /** First path segment, kept for grouping in the UI. */
    category: text("category").notNull(),
    value: jsonb("value").notNull(),
    reason: text("reason").notNull().default(""),
    source: text("source", { enum: ["user", "ai_accepted"] }).notNull(),
    locked: boolean("locked").notNull().default(false),
    supersededBy: uuid("superseded_by").references((): AnyPgColumn => decisions.id, {
      onDelete: "set null",
    }),
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("decisions_project_path_idx").on(t.projectId, t.path)],
);

export const brandSystem = pgTable(
  "brand_system",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    brandJson: jsonb("brand_json").notNull(),
    changeSummary: text("change_summary"),
    diffJson: jsonb("diff_json"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("brand_system_project_version_uq").on(t.projectId, t.version)],
);

export const launchAssets = pgTable(
  "launch_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assetType: text("asset_type").notNull(),
    content: jsonb("content").notNull(),
    version: integer("version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("launch_assets_project_type_version_uq").on(t.projectId, t.assetType, t.version),
  ],
);

export const consistencyChecks = pgTable(
  "consistency_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    result: jsonb("result").notNull(),
    suggestions: jsonb("suggestions"),
    createdAt: createdAt(),
  },
  (t) => [index("consistency_checks_project_idx").on(t.projectId, t.createdAt)],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type BrandContextRow = typeof brandContext.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type DecisionRow = typeof decisions.$inferSelect;

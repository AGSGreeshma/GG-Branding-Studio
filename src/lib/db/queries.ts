import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { LlmTrace } from "@/lib/ai/types";
import {
  BrandContextSchema,
  emptyBrandContext,
  type BrandContext,
} from "@/lib/schemas/brand-context";
import { AppError } from "@/lib/schemas/errors";
import type { InterviewRole, InterviewTurn } from "@/lib/schemas/interview";
import { DEFAULT_PROJECT_NAME, type CreateProjectInput } from "@/lib/schemas/project";
import {
  ENTRY_STAGE_TO_BRAND_STATE,
  type ModuleName,
  type WorkflowPlan,
  type WorkflowState,
} from "@/lib/schemas/workflow";
import { defaultPlanFor } from "@/lib/services/workflow-engine";
import { getDb } from "./client";
import {
  brandContext,
  decisions,
  interviewTurns,
  projects,
  workflowRuns,
  type InterviewTurnRow,
  type Project,
  type RunStatus,
} from "./schema";

/*
 * Owner scoping: every project lookup goes through getProject(ownerId, id).
 * The context and run helpers take a projectId, so route handlers must call
 * getProject first; that call is the authorization check (W3, W8).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === "object" && current !== null && "code" in current) {
      if ((current as { code?: unknown }).code === "23505") return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

export interface ContextSnapshot {
  context: BrandContext;
  version: number;
}

/**
 * Creates the project, its version-1 Brand Context and the default workflow
 * plan for the entry stage (plan §8, §7.5) in one batch.
 */
export async function createProject(
  ownerId: string,
  input: CreateProjectInput,
): Promise<{ project: Project } & ContextSnapshot> {
  const db = getDb();
  const id = crypto.randomUUID();
  const name = input.name ?? DEFAULT_PROJECT_NAME[input.entry_stage];
  const context = emptyBrandContext({
    name: input.name ?? "",
    description: input.description,
    stage: input.entry_stage,
  });

  const [insertedProjects] = await db.batch([
    db
      .insert(projects)
      .values({
        id,
        ownerId,
        name,
        entryStage: input.entry_stage,
        brandState: ENTRY_STAGE_TO_BRAND_STATE[input.entry_stage],
        status: "active",
        workflowState: "DISCOVERY",
        currentPlanJson: defaultPlanFor(input.entry_stage),
      })
      .returning(),
    db.insert(brandContext).values({ projectId: id, contextJson: context, version: 1 }),
  ]);

  const project = insertedProjects[0];
  if (!project) throw new AppError("INTERNAL", { message: "Project insert returned no row" });
  return { project, context, version: 1 };
}

/** The owner's projects, newest first (C2). */
export async function listProjects(ownerId: string, limit = 12): Promise<Project[]> {
  return getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.ownerId, ownerId), eq(projects.status, "active")))
    .orderBy(desc(projects.updatedAt))
    .limit(limit);
}

/** Returns the project only if `ownerId` owns it. Anything else is NOT_FOUND, so IDs cannot be probed. */
export async function getProject(ownerId: string, id: string): Promise<Project> {
  if (!UUID_RE.test(id)) {
    throw new AppError("NOT_FOUND", { message: `Malformed project id` });
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .limit(1);
  const project = rows[0];
  if (!project) {
    throw new AppError("NOT_FOUND", { message: `Project ${id} not found for owner` });
  }
  return project;
}

/** Latest Brand Context version for a project. Call getProject(ownerId, id) first. */
export async function getLatestContext(projectId: string): Promise<ContextSnapshot> {
  const db = getDb();
  const rows = await db
    .select({ contextJson: brandContext.contextJson, version: brandContext.version })
    .from(brandContext)
    .where(eq(brandContext.projectId, projectId))
    .orderBy(desc(brandContext.version))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new AppError("NOT_FOUND", { message: `No brand context for project ${projectId}` });
  }
  const parsed = BrandContextSchema.safeParse(row.contextJson);
  if (!parsed.success) {
    throw new AppError("INTERNAL", {
      message: `Stored brand context v${row.version} for ${projectId} fails the schema`,
      cause: parsed.error,
    });
  }
  return { context: parsed.data, version: row.version };
}

/**
 * Appends version expectedVersion + 1 (optimistic concurrency, G9).
 * Throws CONFLICT if someone else saved first. Call getProject(ownerId, id) first.
 */
export async function saveContext(
  projectId: string,
  context: BrandContext,
  expectedVersion: number,
): Promise<ContextSnapshot> {
  const validated = BrandContextSchema.parse(context);
  const db = getDb();

  const latest = await db
    .select({ version: brandContext.version })
    .from(brandContext)
    .where(eq(brandContext.projectId, projectId))
    .orderBy(desc(brandContext.version))
    .limit(1);
  const currentVersion = latest[0]?.version ?? 0;
  if (currentVersion !== expectedVersion) {
    throw new AppError("CONFLICT", {
      message: `Context version mismatch for ${projectId}: expected ${expectedVersion}, found ${currentVersion}`,
    });
  }

  const nextVersion = expectedVersion + 1;
  try {
    // The unique (project_id, version) index turns a concurrent save into a CONFLICT.
    await db.batch([
      db
        .insert(brandContext)
        .values({ projectId, contextJson: validated, version: nextVersion }),
      db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId)),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", {
        message: `Concurrent context save for ${projectId} at version ${nextVersion}`,
        cause: err,
      });
    }
    throw err;
  }
  return { context: validated, version: nextVersion };
}

export interface RecordRunInput {
  projectId: string;
  trace: LlmTrace;
  module?: ModuleName | null;
  stage?: WorkflowState | null;
  parentRunId?: string | null;
  status?: RunStatus;
  inputContext?: unknown;
  outputContext?: unknown;
  evaluation?: unknown;
}

/** Persists one model call trace to workflow_runs (F9). Returns the run id. */
export async function recordRun(input: RecordRunInput): Promise<string> {
  const { trace } = input;
  const db = getDb();
  const rows = await db
    .insert(workflowRuns)
    .values({
      projectId: input.projectId,
      parentRunId: input.parentRunId ?? null,
      module: input.module ?? null,
      stage: input.stage ?? null,
      status: input.status ?? (trace.errorCode ? "failed" : "succeeded"),
      agent: trace.agent,
      model: trace.model,
      promptVersion: trace.promptVersion,
      tokensIn: trace.tokensIn,
      tokensOut: trace.tokensOut,
      latencyMs: trace.latencyMs,
      retryCount: trace.retryCount,
      errorCode: trace.errorCode,
      evaluationJson: input.evaluation ?? null,
      inputContext: input.inputContext ?? null,
      outputContext: input.outputContext ?? null,
      completedAt: new Date(),
    })
    .returning({ id: workflowRuns.id });
  const id = rows[0]?.id;
  if (!id) throw new AppError("INTERNAL", { message: "workflow_runs insert returned no row" });
  return id;
}

/** Stores a new workflow state and/or plan. Call getProject(ownerId, id) first. */
export async function updateProjectWorkflow(
  projectId: string,
  update: { workflowState?: WorkflowState; plan?: WorkflowPlan; name?: string },
): Promise<void> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (update.workflowState) values.workflowState = update.workflowState;
  if (update.plan) values.currentPlanJson = update.plan;
  if (update.name) values.name = update.name;
  await getDb().update(projects).set(values).where(eq(projects.id, projectId));
}

/** Locked Brand Context paths. No agent output may modify these (plan §11.2). */
export async function getLockedPaths(projectId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ path: decisions.path })
    .from(decisions)
    .where(and(eq(decisions.projectId, projectId), eq(decisions.locked, true)));
  return rows.map((row) => row.path);
}

function toInterviewTurn(row: InterviewTurnRow): InterviewTurn {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    question_reason: row.questionReason,
    suggested_answers: row.suggestedAnswersJson ?? [],
    created_at: row.createdAt.toISOString(),
  };
}

/** The interview so far, oldest first. Call getProject(ownerId, id) first. */
export async function listInterviewTurns(projectId: string): Promise<InterviewTurn[]> {
  const rows = await getDb()
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.projectId, projectId))
    .orderBy(interviewTurns.createdAt, interviewTurns.id);
  return rows.map(toInterviewTurn);
}

export interface NewInterviewTurn {
  projectId: string;
  role: InterviewRole;
  content: string;
  questionReason?: string | null;
  suggestedAnswers?: string[];
  runId?: string | null;
}

export async function addInterviewTurn(input: NewInterviewTurn): Promise<InterviewTurn> {
  const rows = await getDb()
    .insert(interviewTurns)
    .values({
      projectId: input.projectId,
      role: input.role,
      content: input.content,
      questionReason: input.questionReason ?? null,
      suggestedAnswersJson: input.suggestedAnswers ?? null,
      runId: input.runId ?? null,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new AppError("INTERNAL", { message: "interview_turns insert returned no row" });
  return toInterviewTurn(row);
}

/*
 * Module results. Phase 3 keeps a module's current output (the three battle
 * directions and their critique) in `workflow_runs` under a reserved agent
 * name rather than adding a table for it (ADR-020): it is the module's own
 * output, it already has a project-scoped, time-ordered home, and the Brand
 * Context stays reserved for decisions the user has actually made.
 */
export const MODULE_STATE_AGENT = "module_state";

/** Replaces the stored state of one module. Call getProject(ownerId, id) first. */
export async function saveModuleResult(
  projectId: string,
  module: ModuleName,
  result: unknown,
): Promise<void> {
  await getDb().insert(workflowRuns).values({
    projectId,
    module,
    status: "succeeded",
    agent: MODULE_STATE_AGENT,
    outputContext: result,
    completedAt: new Date(),
  });
}

/** The newest stored state for a module, or null. */
export async function getModuleResult(
  projectId: string,
  module: ModuleName,
): Promise<unknown | null> {
  const rows = await getDb()
    .select({ output: workflowRuns.outputContext })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.projectId, projectId),
        eq(workflowRuns.module, module),
        eq(workflowRuns.agent, MODULE_STATE_AGENT),
      ),
    )
    .orderBy(desc(workflowRuns.createdAt))
    .limit(1);
  return rows[0]?.output ?? null;
}

export interface RunSummary {
  id: string;
  agent: string;
  module: ModuleName | null;
  status: RunStatus;
  model: string | null;
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  retryCount: number;
  errorCode: string | null;
  evaluation: unknown;
  createdAt: string;
}

/** Model calls for the "How the AI worked" drawer (E11). Newest first. */
export async function listRuns(projectId: string, limit = 25): Promise<RunSummary[]> {
  const rows = await getDb()
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.projectId, projectId), ne(workflowRuns.agent, MODULE_STATE_AGENT)))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    agent: row.agent,
    module: row.module,
    status: row.status,
    model: row.model,
    latencyMs: row.latencyMs,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    retryCount: row.retryCount,
    errorCode: row.errorCode,
    evaluation: row.evaluationJson,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Records one user decision per context path (plan §11.2, §17). */
export async function saveDecision(input: {
  projectId: string;
  path: string;
  value: unknown;
  locked: boolean;
  reason: string;
  source: "user" | "ai_accepted";
  runId?: string | null;
}): Promise<string> {
  const rows = await getDb()
    .insert(decisions)
    .values({
      projectId: input.projectId,
      path: input.path,
      category: input.path.split(".")[0] ?? input.path,
      value: input.value as never,
      locked: input.locked,
      reason: input.reason,
      source: input.source,
      runId: input.runId ?? null,
    })
    .returning({ id: decisions.id });
  const id = rows[0]?.id;
  if (!id) throw new AppError("INTERNAL", { message: "decisions insert returned no row" });
  return id;
}

/** Sets the lock flag on the most recent decision for a path. */
export async function setDecisionLock(
  projectId: string,
  path: string,
  locked: boolean,
): Promise<void> {
  await getDb()
    .update(decisions)
    .set({ locked, updatedAt: new Date() })
    .where(and(eq(decisions.projectId, projectId), eq(decisions.path, path)));
}

/** Round trip to Postgres for /api/health. Returns latency in ms; throws if unreachable. */
export async function pingDb(): Promise<number> {
  const started = Date.now();
  await getDb().execute(sql`select 1`);
  return Date.now() - started;
}

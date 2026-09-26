import "server-only";
import type { Project } from "@/lib/db/schema";
import {
  getLatestContext,
  getLockedPaths,
  getModuleResult,
  saveContext,
  saveDecision,
  saveModuleResult,
  updateProjectWorkflow,
} from "@/lib/db/queries";
import {
  AntiGenericActionSchema,
  type AntiGenericActionResponse,
} from "@/lib/schemas/anti-generic-actions";
import { AppError } from "@/lib/schemas/errors";
import { AntiGenericResultSchema } from "@/lib/schemas/outputs/anti-generic";
import { applyContextWrites, type ContextWrite } from "../context-manager";
import { logEvent } from "../log";
import { completeStep, defaultPlanFor } from "../workflow-engine";

/*
 * Applying the Anti-Generic Engine's rewrites (plan §11.1).
 * The engine proposes; this is where the user's decision is written down.
 * Accepting nothing is a valid answer and still completes the step.
 */

export async function handleAntiGenericAction(input: {
  project: Project;
  body: unknown;
  requestId: string;
}): Promise<AntiGenericActionResponse> {
  const { project, requestId } = input;
  const body = AntiGenericActionSchema.parse(input.body);

  const [{ context, version }, lockedPaths] = await Promise.all([
    getLatestContext(project.id),
    getLockedPaths(project.id),
  ]);

  const stored = AntiGenericResultSchema.safeParse(
    await getModuleResult(project.id, "anti_generic"),
  );
  if (!stored.success) {
    throw new AppError("NOT_FOUND", {
      message: `No stored anti-generic result for project ${project.id}`,
      publicMessage: "There are no suggested rewrites to apply. Run the step again.",
    });
  }
  const result = stored.data;

  if (body.expected_version !== version) {
    throw new AppError("CONFLICT", {
      message: `Stale context version ${body.expected_version}, current ${version}`,
    });
  }

  // Only fields the engine actually changed, that the user accepted, and that
  // are not locked, are written. The lock check happens again here because
  // this is where the write happens (CLAUDE.md, AI rule 6).
  const accepted = new Set(body.accept_paths);
  const writes: ContextWrite[] = result.fields
    .filter(
      (field) =>
        accepted.has(field.path) && !field.locked && field.current.trim() !== field.original.trim(),
    )
    .map((field) => ({
      path: field.path,
      value: field.current,
      evidence: `Anti-Generic revision of "${field.original}"`,
    }));

  let nextContext = context;
  let nextVersion = version;
  let blockedPaths: string[] = [];

  if (writes.length > 0) {
    const applied = applyContextWrites(context, writes, {
      agent: "anti_generic",
      source: "agent",
      runId: result.run_id,
      lockedPaths,
    });
    blockedPaths = applied.blockedPaths;
    if (blockedPaths.length) {
      logEvent("warn", "context.locked_paths_skipped", {
        request_id: requestId,
        project_id: project.id,
        paths: blockedPaths.join(","),
      });
    }

    const saved = await saveContext(project.id, applied.context, version);
    nextContext = saved.context;
    nextVersion = saved.version;

    for (const path of applied.changedPaths) {
      await saveDecision({
        projectId: project.id,
        path,
        value: result.fields.find((field) => field.path === path)?.current ?? "",
        locked: false,
        reason: "Accepted the Anti-Generic Engine's rewrite.",
        source: "ai_accepted",
        runId: result.run_id,
      }).catch(() => undefined);
    }
  }

  const appliedPaths = writes
    .map((write) => write.path)
    .filter((path) => !blockedPaths.includes(path));

  const nextResult = { ...result, applied: true };
  await saveModuleResult(project.id, "anti_generic", nextResult);

  const plan = completeStep(project.currentPlanJson ?? defaultPlanFor(project.entryStage), "anti_generic");
  await updateProjectWorkflow(project.id, { plan, workflowState: "WORKFLOW_PLANNING" });

  logEvent("info", "anti_generic.applied", {
    request_id: requestId,
    project_id: project.id,
    accepted: appliedPaths.length,
    offered: result.fields.filter((field) => field.current !== field.original).length,
  });

  return {
    anti_generic: nextResult,
    context: nextContext,
    version: nextVersion,
    plan,
    blocked_paths: blockedPaths,
    applied_paths: appliedPaths,
  };
}

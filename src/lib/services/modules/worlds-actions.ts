import "server-only";
import { runWorldsMerge, runWorldsRevise, sliceForWorlds } from "@/lib/agents/five-worlds";
import type { Project } from "@/lib/db/schema";
import {
  getLatestContext,
  getLockedPaths,
  getModuleResult,
  recordRun,
  saveContext,
  saveDecision,
  saveModuleResult,
  updateProjectWorkflow,
} from "@/lib/db/queries";
import { AppError } from "@/lib/schemas/errors";
import { WorldsResultSchema, type World, type WorldsResult } from "@/lib/schemas/outputs/worlds";
import {
  WorldsActionSchema,
  type WorldsActionResponse,
} from "@/lib/schemas/worlds-actions";
import { applyContextWrites, type ContextWrite } from "../context-manager";
import { logEvent } from "../log";
import { completeStep, defaultPlanFor, setStepStatus } from "../workflow-engine";
import { exploreMoreWorlds, runWorldsModule } from "./five-worlds";

/*
 * The user's own actions on the identity worlds (plan §11.1, §14.5):
 * Choose · Combine · Ask AI to revise · Explore 2 more · Generate different.
 */

function requireWorld(result: WorldsResult, id: string): World {
  const world = result.worlds.find((entry) => entry.id === id);
  if (!world) {
    throw new AppError("VALIDATION_ERROR", {
      message: `World ${id} is not part of this exploration`,
      publicMessage: "That world is no longer on the table. Refresh to see the current ones.",
    });
  }
  return world;
}

/**
 * What choosing a world writes to the Brand Context. The strategy is already
 * decided; a world contributes identity, voice and the visual direction.
 */
function writesForWorld(world: World): ContextWrite[] {
  const evidence = `Identity world "${world.name}"`;
  return [
    { path: "personality.traits", value: world.personality, evidence },
    { path: "identity.naming_direction", value: world.naming_direction, evidence },
    {
      path: "identity.candidate_names",
      value: world.sample_names.map((entry) => ({
        name: entry.name,
        territory: world.name,
        rationale: entry.rationale,
        // Availability is never claimed (CLAUDE.md, AI rule 12).
        risks: ["Check availability and trademarks before committing to this name."],
      })),
      evidence,
    },
    { path: "voice.tone", value: world.personality, evidence },
    { path: "voice.rules", value: world.voice_rules, evidence },
    { path: "voice.examples", value: [world.voice_sample_line], evidence },
    { path: "visual.colors", value: world.colors, evidence },
    { path: "visual.typography", value: world.typography, evidence },
    { path: "visual.imagery", value: world.imagery, evidence },
    { path: "visual.composition", value: world.composition, evidence },
  ];
}

export async function handleWorldsAction(input: {
  project: Project;
  body: unknown;
  requestId: string;
}): Promise<WorldsActionResponse> {
  const { project, requestId } = input;
  const body = WorldsActionSchema.parse(input.body);

  const [{ context, version }, lockedPaths] = await Promise.all([
    getLatestContext(project.id),
    getLockedPaths(project.id),
  ]);

  const stored = WorldsResultSchema.safeParse(await getModuleResult(project.id, "five_worlds"));
  if (!stored.success && body.action !== "regenerate") {
    throw new AppError("NOT_FOUND", {
      message: `No stored worlds for project ${project.id}`,
      publicMessage: "These worlds are no longer available. Run the step again for a fresh set.",
    });
  }
  let worlds: WorldsResult = stored.success
    ? stored.data
    : { worlds: [], checks: [], note: null, run_id: null };

  let plan = project.currentPlanJson ?? defaultPlanFor(project.entryStage);
  let nextContext = context;
  let nextVersion = version;
  let blockedPaths: string[] = [];
  let chosenWorldId: WorldsActionResponse["chosen_world_id"] = null;

  switch (body.action) {
    case "regenerate": {
      worlds = await runWorldsModule({
        projectId: project.id,
        context,
        emit: () => {},
        requestId,
        note: body.note ?? null,
      });
      await saveModuleResult(project.id, "five_worlds", worlds);
      break;
    }

    case "explore": {
      if (worlds.worlds.some((world) => world.id === "w4")) {
        throw new AppError("VALIDATION_ERROR", {
          message: `Project ${project.id} already has five worlds`,
          publicMessage: "All five worlds are already on screen.",
          retryable: false,
        });
      }
      worlds = await exploreMoreWorlds({
        projectId: project.id,
        context,
        emit: () => {},
        requestId,
        existing: worlds,
      });
      await saveModuleResult(project.id, "five_worlds", worlds);
      break;
    }

    case "merge": {
      const [firstId, secondId] = body.world_ids;
      const first = requireWorld(worlds, firstId!);
      const second = requireWorld(worlds, secondId!);
      const merged = await runWorldsMerge(
        sliceForWorlds(context),
        first,
        second,
        body.instruction ?? null,
      );
      await recordRun({
        projectId: project.id,
        trace: merged.trace,
        module: "five_worlds",
        stage: "EXPLORATION",
        parentRunId: worlds.run_id,
        outputContext: merged.world,
      }).catch(() => undefined);

      worlds = {
        ...worlds,
        worlds: [...worlds.worlds.filter((world) => world.id !== "merged"), merged.world],
        checks: [
          ...worlds.checks.filter((check) => check.world_id !== "merged"),
          merged.checks,
        ],
        note: merged.note,
      };
      await saveModuleResult(project.id, "five_worlds", worlds);
      break;
    }

    case "revise": {
      const target = requireWorld(worlds, body.world_id);
      const revised = await runWorldsRevise(sliceForWorlds(context), target, body.instruction);
      await recordRun({
        projectId: project.id,
        trace: revised.trace,
        module: "five_worlds",
        stage: "EXPLORATION",
        parentRunId: worlds.run_id,
        outputContext: revised.world,
      }).catch(() => undefined);

      worlds = {
        ...worlds,
        worlds: worlds.worlds.map((world) =>
          world.id === revised.world.id ? revised.world : world,
        ),
        checks: worlds.checks.map((check) =>
          check.world_id === revised.world.id ? revised.checks : check,
        ),
        note: revised.note,
      };
      await saveModuleResult(project.id, "five_worlds", worlds);
      break;
    }

    case "choose": {
      const world = requireWorld(worlds, body.world_id);
      if (body.expected_version !== version) {
        throw new AppError("CONFLICT", {
          message: `Stale context version ${body.expected_version}, current ${version}`,
        });
      }

      const applied = applyContextWrites(context, writesForWorld(world), {
        agent: "five_worlds",
        source: "agent",
        runId: worlds.run_id,
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
      chosenWorldId = world.id;

      for (const path of applied.changedPaths) {
        await saveDecision({
          projectId: project.id,
          path,
          value: (applied.context as unknown as Record<string, unknown>)[path.split(".")[0]!],
          locked: body.lock,
          reason: `Chose the "${world.name}" identity world.`,
          source: "ai_accepted",
          runId: worlds.run_id,
        }).catch(() => undefined);
      }

      plan = completeStep(plan, "five_worlds");
      await updateProjectWorkflow(project.id, { plan, workflowState: "WORKFLOW_PLANNING" });
      logEvent("info", "worlds.chosen", {
        request_id: requestId,
        project_id: project.id,
        world_id: world.id,
        locked: body.lock,
      });
      break;
    }
  }

  if (body.action !== "choose") {
    plan = setStepStatus(plan, "five_worlds", "awaiting_decision");
    await updateProjectWorkflow(project.id, { plan, workflowState: "USER_DECISION" });
  }

  return {
    worlds,
    context: nextContext,
    version: nextVersion,
    plan,
    blocked_paths: blockedPaths,
    chosen_world_id: chosenWorldId,
  };
}

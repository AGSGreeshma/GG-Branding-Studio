import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import {
  getLatestContext,
  getModuleResult,
  getProject,
  listInterviewTurns,
  listRuns,
  type RunSummary,
} from "@/lib/db/queries";
import { toProjectSummary } from "@/lib/db/serialize";
import { isAppError } from "@/lib/schemas/errors";
import { AntiGenericResultSchema } from "@/lib/schemas/outputs/anti-generic";
import { BattleResultSchema } from "@/lib/schemas/outputs/battle";
import { WorldsResultSchema } from "@/lib/schemas/outputs/worlds";
import { defaultPlanFor } from "@/lib/services/workflow-engine";
import { getOwnerId } from "@/lib/session";

/*
 * Workspace page (plan §9). Server-rendered from the owner's own project, so
 * the first paint already shows the workflow, the interview and the context.
 */

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/project/[id]">) {
  const { id } = await params;

  let snapshot;
  let runs: RunSummary[] = [];
  try {
    const ownerId = await getOwnerId();
    const project = await getProject(ownerId, id);
    const [{ context, version }, turns, storedBattle, storedWorlds, storedAntiGeneric, runHistory] =
      await Promise.all([
        getLatestContext(project.id),
        listInterviewTurns(project.id),
        getModuleResult(project.id, "brand_battle"),
        getModuleResult(project.id, "five_worlds"),
        getModuleResult(project.id, "anti_generic"),
        listRuns(project.id),
      ]);
    const battle = BattleResultSchema.safeParse(storedBattle);
    const worlds = WorldsResultSchema.safeParse(storedWorlds);
    const antiGeneric = AntiGenericResultSchema.safeParse(storedAntiGeneric);
    runs = runHistory;
    snapshot = {
      project: toProjectSummary(project),
      context,
      version,
      turns,
      plan: project.currentPlanJson ?? defaultPlanFor(project.entryStage),
      battle: battle.success ? battle.data : null,
      worlds: worlds.success ? worlds.data : null,
      antiGeneric: antiGeneric.success ? antiGeneric.data : null,
    };
  } catch (err) {
    // A project that isn't this guest's is indistinguishable from one that doesn't exist.
    if (isAppError(err) && (err.code === "NOT_FOUND" || err.code === "UNAUTHORIZED")) notFound();
    throw err;
  }

  return <Workspace snapshot={snapshot} runs={runs} />;
}

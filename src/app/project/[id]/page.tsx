import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { getLatestContext, getProject, listInterviewTurns } from "@/lib/db/queries";
import { toProjectSummary } from "@/lib/db/serialize";
import { isAppError } from "@/lib/schemas/errors";
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
  try {
    const ownerId = await getOwnerId();
    const project = await getProject(ownerId, id);
    const [{ context, version }, turns] = await Promise.all([
      getLatestContext(project.id),
      listInterviewTurns(project.id),
    ]);
    snapshot = {
      project: toProjectSummary(project),
      context,
      version,
      turns,
      plan: project.currentPlanJson ?? defaultPlanFor(project.entryStage),
    };
  } catch (err) {
    // A project that isn't this guest's is indistinguishable from one that doesn't exist.
    if (isAppError(err) && (err.code === "NOT_FOUND" || err.code === "UNAUTHORIZED")) notFound();
    throw err;
  }

  return <Workspace snapshot={snapshot} />;
}

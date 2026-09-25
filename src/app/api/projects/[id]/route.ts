import { NextResponse } from "next/server";
import { getLatestContext, getProject, listInterviewTurns } from "@/lib/db/queries";
import { toProjectSummary } from "@/lib/db/serialize";
import { withErrors } from "@/lib/services/route";
import { getOwnerId } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/projects/[id] — project, current Brand Context and interview turns (C3). */
export const GET = withErrors<Params>(async (_request, { params }) => {
  const ownerId = await getOwnerId();
  const { id } = await params;
  const project = await getProject(ownerId, id);
  const [{ context, version }, turns] = await Promise.all([
    getLatestContext(project.id),
    listInterviewTurns(project.id),
  ]);
  return NextResponse.json({ project: toProjectSummary(project), context, version, turns });
});

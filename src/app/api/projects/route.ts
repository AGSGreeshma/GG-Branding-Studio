import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/db/queries";
import { toProjectSummary } from "@/lib/db/serialize";
import { CreateProjectInputSchema } from "@/lib/schemas/project";
import { logEvent } from "@/lib/services/log";
import { withErrors } from "@/lib/services/route";
import { getOwnerId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** POST /api/projects — create a project, its Brand Context and its default plan (C1, D4). */
export const POST = withErrors(async (request, _context, meta) => {
  const ownerId = await getOwnerId();
  const body = CreateProjectInputSchema.parse(await request.json());
  const { project, context, version } = await createProject(ownerId, body);

  logEvent("info", "project.created", {
    request_id: meta.requestId,
    project_id: project.id,
    entry_stage: project.entryStage,
  });

  return NextResponse.json(
    { project: toProjectSummary(project), context, version },
    { status: 201 },
  );
});

/** GET /api/projects — the guest's own projects (C2). */
export const GET = withErrors(async () => {
  const ownerId = await getOwnerId();
  const projects = await listProjects(ownerId);
  return NextResponse.json({ projects: projects.map(toProjectSummary) });
});

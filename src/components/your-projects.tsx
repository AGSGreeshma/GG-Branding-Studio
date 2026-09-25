import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { listProjects } from "@/lib/db/queries";
import { toProjectSummary } from "@/lib/db/serialize";
import { STAGE_OPTIONS } from "@/lib/stages";
import { MODULE_LABELS } from "@/lib/services/workflow-engine";
import { getOwnerId } from "@/lib/session";
import { describeError, logEvent } from "@/lib/services/log";

/*
 * "Your projects" (C2). Same browser, same guest cookie, same projects (§18.6).
 * Renders nothing when there are none, or when the database is unreachable:
 * the landing page must never break because of it.
 */

function stageTitle(stage: string): string {
  return STAGE_OPTIONS.find((option) => option.id === stage)?.title ?? stage;
}

export async function YourProjects() {
  let projects;
  try {
    const ownerId = await getOwnerId();
    projects = (await listProjects(ownerId)).map(toProjectSummary);
  } catch (err) {
    // Never swallow Next's own control-flow signals (the cookie read makes this
    // page dynamic); anything else just hides the list instead of the page.
    unstable_rethrow(err);
    logEvent("warn", "landing.projects_unavailable", describeError(err));
    return null;
  }
  if (projects.length === 0) return null;

  return (
    <section aria-labelledby="your-projects-title" className="border-t border-border py-12 sm:py-16">
      <h2
        id="your-projects-title"
        className="mb-6 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase"
      >
        Your projects
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => {
          const current = project.plan?.steps.find((step) => step.status === "running");
          const done = project.plan?.steps.filter((step) => step.status === "complete").length ?? 0;
          return (
            <li key={project.id}>
              <Link
                href={`/project/${project.id}`}
                className="group flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors outline-none hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{project.name}</span>
                  <ArrowRightIcon
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
                <span className="text-xs text-muted-foreground">
                  {stageTitle(project.entry_stage)}
                </span>
                <span className="mt-auto pt-2 text-xs text-muted-foreground">
                  {current ? MODULE_LABELS[current.module] : "Workflow complete"}
                  {project.plan ? ` · ${done}/${project.plan.steps.length} steps` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

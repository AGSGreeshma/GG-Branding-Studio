"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ThemeToggle } from "@/components/theme-toggle";
import { MODULE_LABELS } from "@/lib/services/workflow-engine";
import { BrandStoreProvider, useBrandStore, type WorkspaceSnapshot } from "@/state/brand-store";
import { BrandContextPanel } from "./brand-context-panel";
import { InterviewPanel } from "./interview-panel";
import { WorkflowSidebar } from "./workflow-sidebar";

/*
 * Three-panel workspace (plan §9): Workflow · AI Workspace · Brand Context.
 * Below lg the panels stack in that same order (§10, E9).
 */

export function Workspace({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  return (
    <BrandStoreProvider snapshot={snapshot}>
      <WorkspaceShell />
    </BrandStoreProvider>
  );
}

function WorkspaceShell() {
  const name = useBrandStore((state) => state.project.name);
  const plan = useBrandStore((state) => state.plan);

  const runningModule = plan.steps.find((step) => step.status === "running")?.module ?? null;
  const showsInterview = runningModule === "interviewer" || plan.steps[0]?.module === "interviewer";

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[100rem] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-lg text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="GG Branding Studio home"
            >
              GG
            </Link>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {runningModule ? MODULE_LABELS[runningModule] : "Workflow complete"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex"
            >
              <ArrowLeftIcon className="size-3.5" aria-hidden />
              All projects
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[100rem] flex-1 grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)_20rem] lg:gap-8">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <WorkflowSidebar />
        </div>

        <main className="min-w-0">
          {showsInterview ? (
            <InterviewPanel />
          ) : (
            <EmptyState
              title="This stage starts somewhere else"
              description="Your workflow begins with a different capability. Those arrive in the next build — the four stages share the same workspace."
              className="py-14"
            />
          )}
        </main>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <BrandContextPanel />
        </div>
      </div>
    </div>
  );
}

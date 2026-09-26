"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, InfoIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingStatus } from "@/components/loading-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { moduleSpec } from "@/lib/agents/registry";
import type { RunSummary } from "@/lib/db/queries";
import { MODULE_LABELS } from "@/lib/services/workflow-engine";
import { BrandStoreProvider, useBrandStore, type WorkspaceSnapshot } from "@/state/brand-store";
import { useWorkflowStream } from "@/state/use-workflow-stream";
import { BattleView } from "./battle-view";
import { BrandContextPanel } from "./brand-context-panel";
import { HowTheAiWorked } from "./how-the-ai-worked";
import { InterviewPanel } from "./interview-panel";
import { WorkflowSidebar } from "./workflow-sidebar";

/*
 * Three-panel workspace (plan §9): Workflow · AI Workspace · Brand Context.
 * Below lg the panels stack in that same order (§10, E9).
 * The client drives the workflow loop: one module per request (ADR-003, E10).
 */

export function Workspace({
  snapshot,
  runs,
}: {
  snapshot: WorkspaceSnapshot;
  runs: RunSummary[];
}) {
  return (
    <BrandStoreProvider snapshot={snapshot}>
      <WorkspaceShell runs={runs} />
    </BrandStoreProvider>
  );
}

/** Safety net: how many steps the workspace may run without the user asking. */
const MAX_AUTO_RUNS = 8;

/** What the agents are doing right now, from the event stream (plan §18.4). */
function ActivityLog() {
  const activity = useBrandStore((state) => state.activity);
  if (activity.length === 0) return null;

  return (
    <ol
      aria-live="polite"
      className="flex flex-col gap-1.5 rounded-xl border border-border bg-card/60 p-3"
    >
      {activity.map((line) => (
        <li
          key={line.id}
          className={`text-xs leading-snug ${
            line.kind === "finding" && line.severity === "high"
              ? "text-destructive"
              : "text-muted-foreground"
          }`}
        >
          <span aria-hidden>
            {line.kind === "agent" ? "✓ " : line.kind === "finding" ? "! " : "· "}
          </span>
          {line.text}
        </li>
      ))}
    </ol>
  );
}

function WorkspaceShell({ runs }: { runs: RunSummary[] }) {
  const router = useRouter();
  const name = useBrandStore((state) => state.project.name);
  const plan = useBrandStore((state) => state.plan);
  const battle = useBrandStore((state) => state.battle);
  const interviewComplete = useBrandStore((state) => state.complete);
  const planFallbackReason = useBrandStore((state) => state.planFallbackReason);
  const workflow = useWorkflowStream();
  const autoRuns = useRef(0);

  const interviewStep = plan.steps.find((step) => step.module === "interviewer");
  const interviewDone = !interviewStep || interviewStep.status === "complete" || interviewComplete;
  const runningModule = plan.steps.find((step) => step.status === "running")?.module ?? null;
  const awaitingDecision = plan.steps.some((step) => step.status === "awaiting_decision");
  const showsBattle = (battle?.directions.length ?? 0) > 0;

  // The next step to run on our own: never a failed one (that is the user's
  // Try Again) and never one that isn't built yet.
  const pendingStep =
    plan.steps.find((step) => step.status === "running") ??
    plan.steps.find((step) => step.status === "pending");
  const autoRunnable =
    pendingStep && moduleSpec(pendingStep.module).implemented ? pendingStep.module : null;

  const { status: workflowStatus, run: runWorkflow } = workflow;

  /*
   * The workflow continues by itself: discovery flows into the Battle, and the
   * Battle's generate step flows into its critique (ADR-023). It stops when a
   * step needs a decision, fails, or isn't built yet. The counter is a
   * circuit-breaker: a module that never advances the plan cannot loop forever.
   */
  useEffect(() => {
    if (!interviewDone || awaitingDecision || !autoRunnable) return;
    if (workflowStatus !== "idle") return;
    if (autoRuns.current >= MAX_AUTO_RUNS) return;
    autoRuns.current += 1;
    void runWorkflow();
  }, [interviewDone, awaitingDecision, autoRunnable, workflowStatus, runWorkflow]);

  // Refresh the server-rendered run list once a module finishes (E11).
  const refreshed = useRef(false);
  useEffect(() => {
    if (workflow.status === "idle" && showsBattle && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [workflow.status, showsBattle, router]);

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
                {runningModule
                  ? MODULE_LABELS[runningModule]
                  : awaitingDecision
                    ? "Waiting for your decision"
                    : "Workflow complete"}
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
        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <WorkflowSidebar />
          {planFallbackReason ? (
            <p className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Showing the standard plan for your stage, because {planFallbackReason}.
            </p>
          ) : null}
        </div>

        <main className="flex min-w-0 flex-col gap-6">
          {!interviewDone ? <InterviewPanel /> : null}

          {interviewDone && workflow.status === "running" ? (
            <div className="flex flex-col gap-3">
              <LoadingStatus message={workflow.message ?? "Working…"} />
              <ActivityLog />
            </div>
          ) : null}

          {interviewDone && workflow.status === "error" ? (
            <ErrorState
              message={workflow.error ?? "We couldn't complete this AI step."}
              onRetry={() => void workflow.run()}
            />
          ) : null}

          {showsBattle ? <BattleView /> : null}

          {interviewDone && !showsBattle && workflow.status === "idle" && !autoRunnable ? (
            <div className="flex flex-col items-start gap-3">
              <EmptyState
                title={pendingStep ? "That step isn't built yet" : "Workflow complete"}
                description={
                  pendingStep
                    ? `"${MODULE_LABELS[pendingStep.module]}" is on the roadmap. Everything you have decided so far is saved.`
                    : "Every step in your workflow has run. Your Brand Context holds the decisions you made."
                }
                className="w-full py-10"
              />
              {pendingStep ? (
                <Button type="button" variant="outline" onClick={() => void workflow.run()}>
                  Try it anyway
                  <ArrowRightIcon className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          ) : null}

          {showsBattle && workflow.status !== "running" ? <ActivityLog /> : null}

          <HowTheAiWorked runs={runs} />
        </main>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <BrandContextPanel />
        </div>
      </div>
    </div>
  );
}

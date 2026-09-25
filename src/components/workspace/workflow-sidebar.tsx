"use client";

import { CheckIcon, CircleDashedIcon } from "lucide-react";
import { useBrandStore } from "@/state/brand-store";
import { MODULE_LABELS } from "@/lib/services/workflow-engine";
import type { PlanStep } from "@/lib/schemas/workflow";

/*
 * Workflow Sidebar (plan §9, E2): what the AI is doing and why.
 * ✓ done · → current · pending, with the orchestrator's reason per step.
 */

function StepMarker({ status }: { status: PlanStep["status"] }) {
  if (status === "complete") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-brand text-background">
        <CheckIcon className="size-3" aria-hidden strokeWidth={3} />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full border-2 border-brand text-brand">
        <span className="size-1.5 rounded-full bg-brand" aria-hidden />
      </span>
    );
  }
  return (
    <span className="flex size-5 items-center justify-center text-muted-foreground/60">
      <CircleDashedIcon className="size-4" aria-hidden />
    </span>
  );
}

const STATUS_LABEL: Record<PlanStep["status"], string> = {
  complete: "Done",
  running: "In progress",
  pending: "Coming up",
  awaiting_decision: "Waiting for you",
  skipped: "Skipped",
  failed: "Didn't finish",
};

export function WorkflowSidebar() {
  const plan = useBrandStore((state) => state.plan);
  const done = plan.steps.filter((step) => step.status === "complete").length;

  return (
    <nav aria-label="Workflow" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Workflow
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {done}/{plan.steps.length}
        </span>
      </div>

      <ol className="flex flex-col gap-1">
        {plan.steps.map((step) => {
          const active = step.status === "running";
          return (
            <li key={step.module}>
              <div
                className={`flex gap-3 rounded-lg px-2 py-2 transition-colors ${
                  active ? "bg-brand-soft/60" : ""
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  <StepMarker status={step.status} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={`text-sm leading-snug ${
                      step.status === "pending" ? "text-muted-foreground" : "font-medium"
                    }`}
                  >
                    {MODULE_LABELS[step.module]}
                  </span>
                  <span className="sr-only">{STATUS_LABEL[step.status]}.</span>
                  <span className="text-xs leading-relaxed text-muted-foreground text-pretty">
                    {step.reason}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="rounded-lg border border-border/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        The AI plans this workflow and explains each step. You can change direction at any point.
      </p>
    </nav>
  );
}

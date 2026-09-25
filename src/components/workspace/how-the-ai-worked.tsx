"use client";

import { useState } from "react";
import { ActivityIcon } from "lucide-react";
import type { RunSummary } from "@/lib/db/queries";

/*
 * "How the AI worked" (E11, plan §9). A plain list of the model calls behind
 * the results: which agent, which model, how long it took and what it scored.
 * The data comes from workflow_runs, so nothing here is reconstructed.
 */

function scoreLine(evaluation: unknown): string | null {
  if (!evaluation || typeof evaluation !== "object") return null;
  const entries = Object.entries(evaluation as Record<string, unknown>);
  const parts: string[] = [];
  for (const [key, value] of entries) {
    if (value && typeof value === "object" && "distinctiveness" in value) {
      const scores = value as Record<string, number>;
      parts.push(
        `${key.toUpperCase()}: distinctiveness ${scores.distinctiveness}, genericity risk ${scores.genericity_risk}`,
      );
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

export function HowTheAiWorked({ runs }: { runs: RunSummary[] }) {
  const [open, setOpen] = useState(false);
  if (runs.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-brand" aria-hidden />
          How the AI worked
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {runs.length} model {runs.length === 1 ? "call" : "calls"}
        </span>
      </button>

      {open ? (
        <ol className="flex flex-col gap-3 border-t border-border px-4 py-3">
          {runs.map((run) => {
            const scores = scoreLine(run.evaluation);
            return (
              <li key={run.id} className="flex flex-col gap-0.5 text-xs">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{run.agent}</span>
                  {run.status === "failed" ? (
                    <span className="rounded-full border border-destructive/40 px-2 py-0.5 text-[0.7rem] text-destructive">
                      {run.errorCode ?? "failed"}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">{run.model ?? "—"}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {run.latencyMs !== null ? `${(run.latencyMs / 1000).toFixed(1)}s` : "—"}
                  </span>
                  {run.retryCount > 0 ? (
                    <span className="text-muted-foreground">
                      {run.retryCount} {run.retryCount === 1 ? "retry" : "retries"}
                    </span>
                  ) : null}
                  {run.tokensIn !== null ? (
                    <span className="text-muted-foreground tabular-nums">
                      {run.tokensIn}/{run.tokensOut ?? 0} tokens
                    </span>
                  ) : null}
                </span>
                {scores ? <span className="text-muted-foreground">{scores}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

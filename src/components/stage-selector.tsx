"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRightIcon,
  GemIcon,
  LightbulbIcon,
  LoaderCircleIcon,
  PackageIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ErrorBodySchema } from "@/lib/schemas/errors";
import { CreateProjectResponseSchema } from "@/lib/schemas/project";
import type { EntryStage } from "@/lib/schemas/workflow";
import { STAGE_OPTIONS } from "@/lib/stages";

const STAGE_ICONS: Record<EntryStage, LucideIcon> = {
  idea: LightbulbIcon,
  product: PackageIcon,
  brand: GemIcon,
  protect: ShieldCheckIcon,
};

const CREATE_FAILED = "We couldn't start your project. Please try again.";

/**
 * "Where are you with your brand?" (plan §8, D1/D4).
 * Selecting a stage creates the project, its Brand Context and its workflow
 * plan, then opens the workspace.
 */
export function StageSelector() {
  const router = useRouter();
  const [pendingStage, setPendingStage] = useState<EntryStage | null>(null);
  const [, startTransition] = useTransition();

  const start = async (stage: EntryStage) => {
    if (pendingStage) return;
    setPendingStage(stage);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entry_stage: stage }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = ErrorBodySchema.safeParse(payload);
        toast.error(parsed.success ? parsed.data.error.message : CREATE_FAILED);
        setPendingStage(null);
        return;
      }
      const parsed = CreateProjectResponseSchema.safeParse(payload);
      if (!parsed.success) {
        toast.error(CREATE_FAILED);
        setPendingStage(null);
        return;
      }
      startTransition(() => router.push(`/project/${parsed.data.project.id}`));
    } catch {
      toast.error("We couldn't reach the studio. Check your connection and try again.");
      setPendingStage(null);
    }
  };

  return (
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4" role="list">
      {STAGE_OPTIONS.map((stage) => {
        const Icon = STAGE_ICONS[stage.id];
        const pending = pendingStage === stage.id;
        return (
          <li key={stage.id}>
            <button
              type="button"
              aria-labelledby={`stage-${stage.id}-title`}
              aria-describedby={`stage-${stage.id}-desc`}
              aria-busy={pending}
              disabled={pendingStage !== null}
              onClick={() => void start(stage.id)}
              className="group relative flex h-full w-full flex-col gap-5 rounded-2xl border border-border bg-card p-5 text-left transition-all duration-200 outline-none hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_12px_32px_-16px_oklch(0.2_0.01_60/0.35)] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:p-6"
            >
              <span className="flex items-start justify-between gap-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="size-5" aria-hidden />
                </span>
                {pending ? (
                  <LoaderCircleIcon className="size-5 animate-spin text-brand" aria-hidden />
                ) : (
                  <ArrowUpRightIcon
                    className="size-5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                    aria-hidden
                  />
                )}
              </span>
              <span className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  {stage.label}
                </span>
                <span
                  id={`stage-${stage.id}-title`}
                  className="font-display text-2xl leading-tight sm:text-[1.7rem]"
                >
                  {stage.title}
                </span>
                <span id={`stage-${stage.id}-desc`} className="text-sm text-muted-foreground">
                  {pending ? "Setting up your workspace…" : stage.description}
                </span>
              </span>
              <span className="mt-auto flex flex-wrap gap-1.5">
                {stage.likely.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {capability}
                  </span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

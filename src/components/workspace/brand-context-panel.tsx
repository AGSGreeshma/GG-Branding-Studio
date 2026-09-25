"use client";

import { HelpCircleIcon, LightbulbIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import type { BrandContext } from "@/lib/schemas/brand-context";
import { TRACKED_CONFIDENCE_PATHS } from "@/lib/services/context-manager";
import { useBrandStore } from "@/state/brand-store";

/*
 * Brand Context panel (plan §9, §12, E4). Updates after every interview turn.
 * Low-confidence fields are shown as assumptions, not as facts (§7.4).
 */

const CONFIDENCE_LABEL: Record<string, string> = {
  low: "Still guessing",
  medium: "Getting there",
  high: "Clear",
};

function Confidence({ context, path }: { context: BrandContext; path: string }) {
  const level = context.meta.confidence.find((entry) => entry.path === path)?.level;
  if (!level) return null;
  const tone =
    level === "high"
      ? "border-brand/40 text-brand"
      : level === "medium"
        ? "border-border text-muted-foreground"
        : "border-dashed border-border text-muted-foreground";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[0.7rem] ${tone}`}>
      {CONFIDENCE_LABEL[level]}
    </span>
  );
}

function Field({
  label,
  value,
  confidencePath,
  context,
}: {
  label: string;
  value: string;
  confidencePath?: string;
  context: BrandContext;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
          {label}
        </h3>
        {confidencePath ? <Confidence context={context} path={confidencePath} /> : null}
      </div>
      {value ? (
        <p className="text-sm leading-relaxed text-pretty">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground/70 italic">Not clear yet.</p>
      )}
    </div>
  );
}

function ListField({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </h3>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground/70 italic">Nothing captured yet.</p>
      )}
    </div>
  );
}

export function BrandContextPanel() {
  const context = useBrandStore((state) => state.context);
  const version = useBrandStore((state) => state.version);

  const hasAnything =
    Boolean(context.problem.statement || context.product.description) ||
    context.audience.primary.length > 0;

  return (
    <aside aria-label="Brand Context" className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Brand Context
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums" title="Context version">
          v{version}
        </span>
      </div>

      {hasAnything ? (
        <div className="flex flex-col gap-5">
          <Field
            label="Problem"
            value={context.problem.statement}
            confidencePath={TRACKED_CONFIDENCE_PATHS[0]}
            context={context}
          />
          <ListField label="Audience" items={context.audience.primary} />
          <Field
            label="Product"
            value={context.product.description}
            confidencePath={TRACKED_CONFIDENCE_PATHS[2]}
            context={context}
          />
          {context.audience.pain_points.length > 0 ? (
            <ListField label="Pain points" items={context.audience.pain_points} />
          ) : null}

          {context.selected_direction ? (
            <div className="flex flex-col gap-2 rounded-xl border border-brand/40 bg-brand-soft/40 p-3">
              <h3 className="text-xs font-medium tracking-[0.1em] text-brand uppercase">
                Chosen direction
              </h3>
              <p className="text-sm font-medium">{context.selected_direction.name}</p>
              <p className="text-sm leading-relaxed text-pretty">
                {context.selected_direction.summary}
              </p>
            </div>
          ) : null}

          {context.positioning.statement ? (
            <>
              <Field label="Positioning" value={context.positioning.statement} context={context} />
              <Field label="Category" value={context.positioning.category} context={context} />
              <Field
                label="Differentiator"
                value={context.positioning.differentiator}
                context={context}
              />
            </>
          ) : null}

          {context.personality.traits.length > 0 ? (
            <ListField label="Personality" items={context.personality.traits} />
          ) : null}
        </div>
      ) : (
        <EmptyState
          title="Nothing here yet"
          description="As you answer, what the AI understands about your problem, your audience and your product appears here."
        />
      )}

      {context.meta.assumptions.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3">
          <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
            <LightbulbIcon className="size-3.5" aria-hidden />
            Assumptions
          </h3>
          <ul className="flex flex-col gap-1.5">
            {context.meta.assumptions.map((assumption) => (
              <li key={assumption} className="text-sm leading-snug text-pretty">
                {assumption}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            These are the AI&apos;s guesses, not your decisions. Correct any of them in your next
            answer.
          </p>
        </section>
      ) : null}

      {context.meta.open_questions.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
            <HelpCircleIcon className="size-3.5" aria-hidden />
            Still open
          </h3>
          <ul className="flex flex-col gap-1.5">
            {context.meta.open_questions.map((question) => (
              <li key={question} className="text-sm leading-snug text-muted-foreground text-pretty">
                {question}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}

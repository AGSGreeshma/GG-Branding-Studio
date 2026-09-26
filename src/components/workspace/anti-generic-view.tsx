"use client";

import { useState } from "react";
import { ArrowRightIcon, CheckIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { LoadingStatus } from "@/components/loading-status";
import { Button } from "@/components/ui/button";
import { segmentText, type LexiconHit } from "@/lib/lexicon/detect";
import {
  AntiGenericActionResponseSchema,
} from "@/lib/schemas/anti-generic-actions";
import { ErrorBodySchema } from "@/lib/schemas/errors";
import {
  ISSUE_KIND_LABELS,
  SCORE_LABELS,
  type CriticFinding,
  type GenericScores,
  type Round,
} from "@/lib/schemas/outputs/anti-generic";
import { useBrandStore, useBrandStoreApi } from "@/state/brand-store";

/*
 * The Anti-Generic Engine's results (plan §14.6, N11).
 *
 * This is the screen that shows the product challenging itself, so it earns
 * the space: the original line with its clichés highlighted in place, the
 * rewrite, the reason, and what the scores did. Nothing is applied until the
 * user says so (§11.1).
 */

const SEVERITY_STYLES: Record<LexiconHit["severity"], string> = {
  high: "bg-destructive/15 text-destructive decoration-destructive/60",
  medium: "bg-amber-500/15 text-amber-700 decoration-amber-600/60 dark:text-amber-400",
  low: "bg-muted text-muted-foreground decoration-muted-foreground/50",
};

/** The original text with every lexicon hit marked where it occurs. */
function HighlightedText({ text, hits }: { text: string; hits: LexiconHit[] }) {
  const segments = segmentText(text, hits);
  return (
    <p className="text-sm leading-relaxed text-pretty">
      {segments.map((segment, index) =>
        segment.hit ? (
          <mark
            key={`${segment.hit.start}-${index}`}
            title={segment.hit.note}
            className={`rounded-sm px-0.5 underline decoration-wavy underline-offset-2 ${SEVERITY_STYLES[segment.hit.severity]}`}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`plain-${index}`}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

function ScoreDelta({ before, after }: { before: GenericScores; after: GenericScores | null }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.7rem] sm:grid-cols-4">
      {(Object.keys(SCORE_LABELS) as Array<keyof GenericScores>).map((key) => {
        const from = before[key];
        const to = after?.[key];
        const lowerIsBetter = key === "genericity_risk";
        const improved =
          to === undefined ? false : lowerIsBetter ? to < from : to > from;
        const worse = to === undefined ? false : lowerIsBetter ? to > from : to < from;
        return (
          <div key={key} className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">{SCORE_LABELS[key]}</dt>
            <dd className="flex items-center gap-1 tabular-nums">
              <span className={to === undefined ? "" : "text-muted-foreground line-through"}>
                {from}
              </span>
              {to === undefined ? null : (
                <>
                  <ArrowRightIcon className="size-3 text-muted-foreground" aria-hidden />
                  <span
                    className={
                      improved ? "font-medium text-brand" : worse ? "text-destructive" : ""
                    }
                  >
                    {to}
                  </span>
                </>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function IssueList({ issues }: { issues: CriticFinding["issues"] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {issues.map((issue) => (
        <li key={`${issue.kind}-${issue.evidence}`} className="text-xs leading-snug">
          <span
            className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[0.65rem] ${
              issue.severity === "high"
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {ISSUE_KIND_LABELS[issue.kind]}
          </span>
          {issue.note}
          <span className="mt-0.5 block text-[0.7rem] text-muted-foreground italic">
            “{issue.evidence}”
          </span>
        </li>
      ))}
    </ul>
  );
}

function hitsFor(rounds: Round[], path: string, roundIndex: number): LexiconHit[] {
  const round = rounds[roundIndex];
  const entry = round?.lexicon.find((item) => item.path === path);
  return (entry?.hits ?? []) as LexiconHit[];
}

function findingFor(rounds: Round[], path: string, roundIndex: number): CriticFinding | undefined {
  return rounds[roundIndex]?.findings.find((finding) => finding.target_path === path);
}

/** Every change made to one field across all rounds, oldest first. */
function changesFor(rounds: Round[], path: string) {
  return rounds.flatMap((round) =>
    round.changes
      .filter((change) => change.path === path)
      .map((change) => ({ ...change, round: round.round })),
  );
}

export function AntiGenericView() {
  const store = useBrandStoreApi();
  const result = useBrandStore((state) => state.antiGeneric);
  const version = useBrandStore((state) => state.version);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  if (!result || result.fields.length === 0) return null;

  const rounds = result.rounds;
  const changed = result.fields.filter((field) => field.current.trim() !== field.original.trim());
  const unchanged = result.fields.filter(
    (field) => field.current.trim() === field.original.trim(),
  );
  const lastRound = rounds[rounds.length - 1];
  const reverted = rounds.flatMap((round) => round.reverted);

  const toggle = (path: string) =>
    setRejected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  async function apply() {
    setPending(true);
    setError(null);
    try {
      const { project, applyModuleResponse } = store.getState();
      const response = await fetch(`/api/projects/${project.id}/modules/anti_generic`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          accept_paths: changed
            .map((field) => field.path)
            .filter((path) => !rejected.has(path)),
          expected_version: version,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = ErrorBodySchema.safeParse(payload);
        setError(
          parsed.success
            ? parsed.data.error.message
            : "We couldn't save those changes. Your previous work is safe.",
        );
        return;
      }
      const parsed = AntiGenericActionResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError("We couldn't read the studio's answer. Your previous work is safe.");
        return;
      }
      applyModuleResponse(parsed.data);
    } catch {
      setError("We couldn't reach the studio. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const acceptedCount = changed.filter((field) => !rejected.has(field.path)).length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Anti-Generic Engine
        </h2>
        <p className="font-display text-2xl leading-tight text-balance sm:text-3xl">
          {changed.length > 0
            ? `${changed.length} ${changed.length === 1 ? "line" : "lines"} could be said by anyone. Here they are, rewritten.`
            : "Your brand language survived the critic."}
        </p>
        <p className="text-sm text-muted-foreground text-pretty">
          A word-list check runs first, then a separate critic scores each line, then a writer
          rewrites only what failed — {rounds.length} {rounds.length === 1 ? "round" : "rounds"}.
          {lastRound?.stopped_because ? ` ${lastRound.stopped_because}` : ""}
        </p>
      </header>

      {error ? <ErrorState message={error} onRetry={() => void apply()} /> : null}
      {pending ? <LoadingStatus message="Saving the language you accepted…" /> : null}

      {changed.map((field) => {
        const first = findingFor(rounds, field.path, 0);
        const last = findingFor(rounds, field.path, rounds.length - 1);
        const fieldChanges = changesFor(rounds, field.path);
        const keep = !rejected.has(field.path);

        return (
          <article
            key={field.path}
            className={`flex flex-col gap-4 rounded-xl border bg-card p-4 transition-colors sm:p-5 ${
              keep ? "border-brand/40" : "border-border"
            }`}
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xl">{field.label}</h3>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={keep}
                  onChange={() => toggle(field.path)}
                  className="size-4 accent-[var(--color-brand)]"
                />
                Keep the rewrite
              </label>
            </header>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background/60 p-3">
                <p className="text-[0.7rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                  Before
                </p>
                <HighlightedText text={field.original} hits={hitsFor(rounds, field.path, 0)} />
                {first ? (
                  <>
                    <p className="text-xs text-muted-foreground italic">{first.verdict}</p>
                    <IssueList issues={first.issues} />
                  </>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-brand-soft/30 p-3">
                <p className="flex items-center gap-1.5 text-[0.7rem] font-medium tracking-[0.1em] text-brand uppercase">
                  <SparklesIcon className="size-3" aria-hidden />
                  After
                </p>
                <p className="text-sm leading-relaxed text-pretty">{field.current}</p>
                {fieldChanges.map((change) => (
                  <p key={`${change.round}-${change.after}`} className="text-xs text-muted-foreground">
                    Round {change.round}: {change.reason}
                  </p>
                ))}
              </div>
            </div>

            <ScoreDelta
              before={first?.scores ?? { genericity_risk: 0, distinctiveness: 0, audience_fit: 0, specificity: 0 }}
              after={rounds.length > 1 ? (last?.scores ?? null) : null}
            />
          </article>
        );
      })}

      {reverted.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-4">
          <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Rewrites the engine threw away
          </h3>
          <p className="text-xs text-muted-foreground">
            The critic scored these rewrites worse than what they replaced, so the earlier version
            was kept. This is the loop checking its own work (ADR-029).
          </p>
          <ul className="flex flex-col gap-2">
            {reverted.map((entry) => (
              <li key={`${entry.path}-${entry.discarded}`} className="text-xs leading-snug">
                <span className="font-medium">{entry.label}</span>
                <span className="mt-0.5 block text-muted-foreground line-through">
                  {entry.discarded}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {unchanged.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4">
          <h3 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Left alone
          </h3>
          <ul className="flex flex-col gap-3">
            {unchanged.map((field) => {
              const finding = findingFor(rounds, field.path, 0);
              return (
                <li key={field.path} className="flex flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {field.label}
                    {field.locked ? (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-normal text-muted-foreground">
                        Locked by you
                      </span>
                    ) : null}
                  </p>
                  <HighlightedText text={field.current} hits={hitsFor(rounds, field.path, 0)} />
                  {finding ? (
                    <p className="text-xs text-muted-foreground italic">{finding.verdict}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {changed.length > 0 && !result.applied ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm">
            {acceptedCount === 0
              ? "Keeping all of your original wording."
              : `Applying ${acceptedCount} of ${changed.length} ${changed.length === 1 ? "rewrite" : "rewrites"} to your Brand Context.`}
          </p>
          <Button type="button" disabled={pending} onClick={() => void apply()}>
            <CheckIcon className="size-4" aria-hidden />
            {acceptedCount === 0 ? "Keep my originals" : "Apply these changes"}
          </Button>
        </section>
      ) : null}

      {result.applied ? (
        <p className="flex items-center gap-2 rounded-xl border border-brand/40 bg-brand-soft/40 px-4 py-3 text-sm">
          <CheckIcon className="size-4 text-brand" aria-hidden />
          Your decisions are saved in the Brand Context.
        </p>
      ) : null}

      {rounds.length > 1 ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Scores come from the critic model and are a signal, not a measurement. The word-list hits
          above them are deterministic.
        </p>
      ) : null}
    </div>
  );
}

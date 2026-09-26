"use client";

import { useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  CombineIcon,
  RefreshCwIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { LoadingStatus } from "@/components/loading-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBodySchema } from "@/lib/schemas/errors";
import {
  BattleActionResponseSchema,
  type BattleAction,
} from "@/lib/schemas/battle-actions";
import {
  LENS_LABELS,
  SCORE_LABELS,
  type BattleDirection,
  type BattleScores,
  type DirectionCritique,
} from "@/lib/schemas/outputs/battle";
import { useBrandStore, useBrandStoreApi } from "@/state/brand-store";

/*
 * Brand Battle results (plan §14.3, §11.1, K10–K11).
 * Three role-labelled directions, the critic's objections underneath, and the
 * decisions the user can make: Choose · Combine · Revise · Generate another.
 * The AI recommends; the user decides (CLAUDE.md non-negotiable 5).
 */

const ACTION_MESSAGES: Record<BattleAction["action"], string> = {
  regenerate: "Running a fresh battle…",
  merge: "Combining the two directions…",
  revise: "Revising that direction…",
  choose: "Saving your decision…",
};

function ScoreBar({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const good = invert ? 10 - value : value;
  const tone = good >= 8 ? "bg-brand" : good >= 6 ? "bg-foreground/55" : "bg-destructive/70";
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[0.7rem] text-muted-foreground">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className={`block h-full rounded-full ${tone}`}
          style={{ width: `${value * 10}%` }}
        />
      </span>
      <span className="w-6 text-right text-[0.7rem] tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

function Scores({ scores }: { scores: BattleScores }) {
  return (
    <div className="flex flex-col gap-1.5">
      {(Object.keys(SCORE_LABELS) as Array<keyof BattleScores>).map((key) => (
        <ScoreBar
          key={key}
          label={SCORE_LABELS[key]}
          value={scores[key]}
          invert={key === "genericity_risk"}
        />
      ))}
    </div>
  );
}

function WhyDisclosure({
  direction,
  critique,
  alternatives,
}: {
  direction: BattleDirection;
  critique: DirectionCritique | undefined;
  alternatives: string[];
}) {
  return (
    <details className="group rounded-lg border border-border/70 bg-background/60">
      <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flex items-center justify-between">
          Why this direction?
          <span className="text-muted-foreground group-open:hidden">Show</span>
          <span className="hidden text-muted-foreground group-open:inline">Hide</span>
        </span>
      </summary>
      {/* Explainability fields from plan §11.3. */}
      <dl className="flex flex-col gap-2 border-t border-border/70 px-3 py-2.5 text-xs leading-relaxed">
        <div>
          <dt className="font-medium">Recommendation</dt>
          <dd className="text-muted-foreground">{direction.positioning.statement}</dd>
        </div>
        <div>
          <dt className="font-medium">Why</dt>
          <dd className="text-muted-foreground">{direction.why_this_lens}</dd>
        </div>
        <div>
          <dt className="font-medium">Evidence from your Brand Context</dt>
          <dd className="text-muted-foreground">
            {direction.audience_focus} · {direction.positioning.differentiator}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Risk</dt>
          <dd className="text-muted-foreground">
            {direction.risks[0] ?? critique?.verdict ?? "No risk was stated."}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Alternative</dt>
          <dd className="text-muted-foreground">
            {alternatives.length ? alternatives.join(" · ") : "This is the only direction left."}
          </dd>
        </div>
      </dl>
    </details>
  );
}

export function BattleView() {
  const store = useBrandStoreApi();
  const battle = useBrandStore((state) => state.battle);
  const version = useBrandStore((state) => state.version);
  const context = useBrandStore((state) => state.context);
  const decisionPrompt = useBrandStore((state) => state.decisionPrompt);
  const plan = useBrandStore((state) => state.plan);
  const workflowStatus = useBrandStore((state) => state.workflowStatus);

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [combineIds, setCombineIds] = useState<string[]>([]);
  const [combineNote, setCombineNote] = useState("");
  const [reviseFor, setReviseFor] = useState<string | null>(null);
  const [reviseText, setReviseText] = useState("");
  const [regenerateNote, setRegenerateNote] = useState("");
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [lock, setLock] = useState(false);

  if (!battle || battle.directions.length === 0) return null;

  const chosenId = context.selected_direction?.name
    ? battle.directions.find(
        (direction) => direction.name === context.selected_direction?.name,
      )?.id
    : undefined;

  const critiqueFor = (id: string): DirectionCritique | undefined =>
    battle.critique?.critiques.find((entry) => entry.direction_id === id);

  const recommendedId = battle.critique?.recommendation.direction_id;

  /*
   * The critique is its own workflow step (ADR-023), so the directions are on
   * screen before it finishes. Say what is happening rather than showing three
   * cards with a silent gap where the critic should be.
   */
  const critiqueStep = plan.steps.find((step) => step.module === "battle_critique");
  const critiquePending =
    battle.critique === null &&
    critiqueStep !== undefined &&
    critiqueStep.status !== "complete" &&
    critiqueStep.status !== "skipped";
  const critiqueFailed = critiquePending && (critiqueStep?.status === "failed" || workflowStatus === "error");

  async function send(action: BattleAction) {
    setPending(action.action);
    setError(null);
    try {
      const { project, applyBattleResponse } = store.getState();
      const response = await fetch(`/api/projects/${project.id}/modules/brand_battle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = ErrorBodySchema.safeParse(payload);
        setError(
          parsed.success
            ? parsed.data.error.message
            : "We couldn't complete this AI step. Your previous work is safe.",
        );
        return;
      }
      const parsed = BattleActionResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError("We couldn't read the studio's answer. Your previous work is safe.");
        return;
      }
      applyBattleResponse(parsed.data);
      setCombineIds([]);
      setCombineNote("");
      setReviseFor(null);
      setReviseText("");
      setShowRegenerate(false);
      setRegenerateNote("");
    } catch {
      setError("We couldn't reach the studio. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  const toggleCombine = (id: string) => {
    setCombineIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id].slice(-2),
    );
  };

  const busy = pending !== null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Brand Battle
        </h2>
        <p className="font-display text-2xl leading-tight text-balance sm:text-3xl">
          {decisionPrompt ??
            "Three directions are strategically viable. Which one should this brand take?"}
        </p>
        <p className="text-sm text-muted-foreground text-pretty">
          Each direction was argued by a different strategist and then challenged by a critic. The
          AI recommends — you decide.
        </p>
        {battle.divergence_note ? (
          <p className="mt-1 flex items-start gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {battle.divergence_note}
          </p>
        ) : null}
      </header>

      {error ? <ErrorState message={error} /> : null}
      {busy ? <LoadingStatus message={ACTION_MESSAGES[pending as BattleAction["action"]]} /> : null}

      {critiquePending && !busy ? (
        critiqueFailed ? (
          <p className="rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
            The critic didn&apos;t finish reviewing these directions. Your directions are saved —
            use Try again above to run just the review.
          </p>
        ) : (
          <LoadingStatus message="The critic is reviewing the three directions…" />
        )
      ) : null}

      <ul className="grid gap-4 xl:grid-cols-3">
        {battle.directions.map((direction) => {
          const critique = critiqueFor(direction.id);
          const recommended = direction.id === recommendedId;
          const chosen = direction.id === chosenId;
          const selectedForCombine = combineIds.includes(direction.id);

          return (
            <li key={direction.id}>
              <article
                className={`flex h-full flex-col gap-4 rounded-xl border bg-card p-4 transition-colors ${
                  chosen
                    ? "border-brand ring-1 ring-brand/40"
                    : selectedForCombine
                      ? "border-foreground/40"
                      : "border-border"
                }`}
              >
                <header className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[0.7rem] font-medium text-brand">
                      {LENS_LABELS[direction.lens]}
                    </span>
                    {recommended ? (
                      <span className="flex items-center gap-1 rounded-full border border-brand/40 px-2.5 py-0.5 text-[0.7rem] text-brand">
                        <SparklesIcon className="size-3" aria-hidden />
                        Recommended by the critic
                      </span>
                    ) : null}
                    {chosen ? (
                      <span className="flex items-center gap-1 rounded-full bg-brand px-2.5 py-0.5 text-[0.7rem] text-background">
                        <CheckIcon className="size-3" aria-hidden strokeWidth={3} />
                        Your choice
                      </span>
                    ) : null}
                  </div>
                  <h3 className="font-display text-2xl leading-tight">{direction.name}</h3>
                  <p className="text-sm leading-relaxed text-pretty">
                    {direction.positioning.statement}
                  </p>
                </header>

                <dl className="flex flex-col gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Category</dt>
                    <dd>{direction.positioning.category}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Audience</dt>
                    <dd>{direction.audience_focus}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Differentiator</dt>
                    <dd>{direction.positioning.differentiator}</dd>
                  </div>
                </dl>

                <ul className="flex flex-wrap gap-1.5">
                  {direction.personality.map((trait) => (
                    <li
                      key={trait}
                      className="rounded-full border border-border px-2 py-0.5 text-[0.7rem]"
                    >
                      {trait}
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col gap-1 text-xs">
                  <p className="text-muted-foreground">Strengths</p>
                  <ul className="flex flex-col gap-1">
                    {direction.strengths.map((strength) => (
                      <li key={strength} className="leading-snug">
                        + {strength}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-muted-foreground">Risks</p>
                  <ul className="flex flex-col gap-1">
                    {direction.risks.map((risk) => (
                      <li key={risk} className="leading-snug text-muted-foreground">
                        − {risk}
                      </li>
                    ))}
                  </ul>
                </div>

                {critique ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium">The critic says</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {critique.verdict}
                    </p>
                    <Scores scores={critique.scores} />
                    {critique.objections.length ? (
                      <ul className="flex flex-col gap-2">
                        {critique.objections.map((objection) => (
                          <li key={objection.claim} className="text-xs leading-snug">
                            <span className="text-muted-foreground">Objection: </span>
                            {objection.claim}
                            <span className="mt-0.5 block text-[0.7rem] text-muted-foreground italic">
                              “{objection.evidence}”
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {critique.cliches.length ? (
                      <p className="text-[0.7rem] text-muted-foreground">
                        Clichés spotted: {critique.cliches.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    {critiquePending
                      ? "The critic is still reviewing this one."
                      : "No critique for this version yet."}
                  </p>
                )}

                {direction.obvious_ideas_rejected.length > 0 ? (
                  <details className="group rounded-lg border border-border/70 bg-background/60">
                    <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <span className="flex items-center justify-between">
                        What we ruled out
                        <span className="text-muted-foreground group-open:hidden">Show</span>
                        <span className="hidden text-muted-foreground group-open:inline">Hide</span>
                      </span>
                    </summary>
                    {/* The obvious directions this lens rejected before writing its own (ADR-026). */}
                    <ul className="flex flex-col gap-1.5 border-t border-border/70 px-3 py-2.5">
                      {direction.obvious_ideas_rejected.map((idea) => (
                        <li key={idea} className="text-xs leading-snug text-muted-foreground">
                          {idea}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <WhyDisclosure
                  direction={direction}
                  critique={critique}
                  alternatives={battle.directions
                    .filter((entry) => entry.id !== direction.id)
                    .map((entry) => entry.name)}
                />

                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void send({
                        action: "choose",
                        direction_id: direction.id,
                        lock,
                        expected_version: version,
                      })
                    }
                  >
                    {chosen ? "Keep this choice" : "Choose"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => toggleCombine(direction.id)}
                  >
                    {selectedForCombine ? "Selected" : "Combine"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      setReviseFor((current) => (current === direction.id ? null : direction.id))
                    }
                  >
                    <WandSparklesIcon className="size-3.5" aria-hidden />
                    Revise
                  </Button>
                </div>

                {reviseFor === direction.id ? (
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor={`revise-${direction.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      What should change about this direction?
                    </label>
                    <Textarea
                      id={`revise-${direction.id}`}
                      rows={2}
                      value={reviseText}
                      onChange={(event) => setReviseText(event.target.value)}
                      placeholder="e.g. keep the idea but make it sound less like surveillance"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || reviseText.trim().length === 0}
                      onClick={() =>
                        void send({
                          action: "revise",
                          direction_id: direction.id,
                          instruction: reviseText.trim(),
                        })
                      }
                    >
                      Ask the AI to revise
                    </Button>
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lock}
              onChange={(event) => setLock(event.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            Lock the positioning when I choose
          </label>
          <span className="text-xs text-muted-foreground">
            A locked decision becomes a hard constraint for every later step.
          </span>
        </div>

        {combineIds.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Combining {combineIds.length === 2 ? "two directions" : "one direction — pick one more"}
              {combineIds.length === 2
                ? `: ${combineIds.map((id) => id.toUpperCase()).join(" + ")}`
                : ""}
            </p>
            <Textarea
              rows={2}
              value={combineNote}
              onChange={(event) => setCombineNote(event.target.value)}
              placeholder="Optional: what should the combination keep?"
              aria-label="What should the combination keep?"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || combineIds.length !== 2}
                onClick={() =>
                  void send({
                    action: "merge",
                    direction_ids: combineIds as ["a", "b"],
                    instruction: combineNote.trim() || undefined,
                  })
                }
              >
                <CombineIcon className="size-3.5" aria-hidden />
                Combine these two
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCombineIds([])}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {showRegenerate ? (
            <>
              <label htmlFor="regenerate-note" className="text-sm">
                None of these fit because…
              </label>
              <Textarea
                id="regenerate-note"
                rows={2}
                value={regenerateNote}
                onChange={(event) => setRegenerateNote(event.target.value)}
                placeholder="Optional, but it makes the next battle much better"
              />
            </>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (!showRegenerate) {
                  setShowRegenerate(true);
                  return;
                }
                void send({ action: "regenerate", note: regenerateNote.trim() || undefined });
              }}
            >
              <RefreshCwIcon className="size-3.5" aria-hidden />
              Generate another battle
            </Button>
            {showRegenerate ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowRegenerate(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

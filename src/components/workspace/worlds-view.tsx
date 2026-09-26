"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  CombineIcon,
  PlusIcon,
  RefreshCwIcon,
  WandSparklesIcon,
} from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { LoadingStatus } from "@/components/loading-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBodySchema } from "@/lib/schemas/errors";
import type { World, WorldChecks } from "@/lib/schemas/outputs/worlds";
import {
  WorldsActionResponseSchema,
  type WorldsAction,
} from "@/lib/schemas/worlds-actions";
import { findFont, fontStack, googleFontsUrl } from "@/lib/visual/fonts";
import { useBrandStore, useBrandStoreApi } from "@/state/brand-store";

/*
 * One Idea, Five Worlds (plan §14.5, M9). Worlds are compared visually, not
 * as text walls: every card renders its real palette, a live specimen of its
 * actual typeface, and a headline written in its own voice.
 */

const ACTION_MESSAGES: Record<WorldsAction["action"], string> = {
  regenerate: "Exploring three different worlds…",
  explore: "Exploring two more worlds…",
  merge: "Combining the two worlds…",
  revise: "Revising that world…",
  choose: "Saving your identity direction…",
};

/** Loads the allowlisted families so the specimens are real (T2). */
function useGoogleFonts(families: string[]) {
  const href = useMemo(() => {
    const fonts = families
      .map((family) => findFont(family))
      .filter((font): font is NonNullable<typeof font> => font !== null);
    return googleFontsUrl(fonts);
  }, [families]);

  useEffect(() => {
    if (!href) return;
    const existing = document.querySelector<HTMLLinkElement>(`link[data-gg-fonts="${href}"]`);
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.ggFonts = href;
    document.head.append(link);
  }, [href]);
}

function Swatches({ world }: { world: World }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {world.colors.map((color) => {
        const valid = /^#[0-9A-F]{6}$/i.test(color.hex);
        return (
          <li key={`${color.name}-${color.hex}`} className="flex flex-col items-center gap-1">
            <span
              aria-hidden
              title={`${color.name} ${color.hex} — ${color.role}`}
              className="block size-9 rounded-md border border-border"
              style={
                valid
                  ? { backgroundColor: color.hex }
                  : {
                      backgroundImage:
                        "repeating-linear-gradient(45deg, var(--color-muted) 0 4px, transparent 4px 8px)",
                    }
              }
            />
            <span className="text-[0.6rem] text-muted-foreground tabular-nums">
              {valid ? color.hex.replace("#", "") : "??"}
            </span>
            <span className="sr-only">
              {color.name}, {color.role}, {valid ? color.hex : "invalid colour"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The headline and body specimen, set in the world's own typefaces. */
function Specimen({ world }: { world: World }) {
  const headingFamily = world.typography.find((entry) => /head/i.test(entry.role))?.family;
  const bodyFamily = world.typography.find((entry) => /body|text/i.test(entry.role))?.family;
  const background = world.colors.find((color) => /background|base|surface/i.test(color.role));
  const text = world.colors.find((color) => /text|ink|foreground/i.test(color.role));
  const accent = world.colors.find((color) => /accent/i.test(color.role));

  const valid = (hex: string | undefined) => (hex && /^#[0-9A-F]{6}$/i.test(hex) ? hex : undefined);

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border p-4"
      style={{
        backgroundColor: valid(background?.hex) ?? "var(--color-card)",
        color: valid(text?.hex) ?? "var(--color-foreground)",
      }}
    >
      <p
        className="text-xl leading-tight text-balance"
        style={{ fontFamily: fontStack(findFont(headingFamily ?? "")) }}
      >
        {world.tagline_direction.split(/[.:—]/)[0]?.trim() || world.name}
      </p>
      <p
        className="text-sm leading-relaxed text-pretty"
        style={{ fontFamily: fontStack(findFont(bodyFamily ?? "")) }}
      >
        {world.voice_sample_line}
      </p>
      <p className="flex flex-wrap gap-2 pt-1 text-[0.7rem] opacity-70">
        {world.typography.map((entry) => (
          <span key={entry.role}>
            {entry.role}: {entry.family}
          </span>
        ))}
        {accent && valid(accent.hex) ? (
          <span className="inline-flex items-center gap-1">
            accent
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: accent.hex }}
            />
          </span>
        ) : null}
      </p>
    </div>
  );
}

function CheckNotes({ checks }: { checks: WorldChecks | undefined }) {
  if (!checks) return null;
  const { issues, contrast } = checks;
  if (issues.length === 0) {
    return contrast ? (
      <p className="text-[0.7rem] text-muted-foreground">
        Contrast {contrast.ratio}:1 ({contrast.level}) — {contrast.text} on {contrast.background}.
      </p>
    ) : null;
  }
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((issue) => (
        <li
          key={issue.message}
          className={`flex items-start gap-1.5 text-[0.7rem] leading-snug ${
            issue.severity === "high" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

export function WorldsView() {
  const store = useBrandStoreApi();
  const worlds = useBrandStore((state) => state.worlds);
  const version = useBrandStore((state) => state.version);
  const context = useBrandStore((state) => state.context);

  const [pending, setPending] = useState<WorldsAction["action"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [combineIds, setCombineIds] = useState<string[]>([]);
  const [combineNote, setCombineNote] = useState("");
  const [reviseFor, setReviseFor] = useState<string | null>(null);
  const [reviseText, setReviseText] = useState("");
  const [lock, setLock] = useState(false);

  const families = useMemo(
    () => (worlds?.worlds ?? []).flatMap((world) => world.typography.map((entry) => entry.family)),
    [worlds],
  );
  useGoogleFonts(families);

  if (!worlds || worlds.worlds.length === 0) return null;

  const chosenName = context.identity.naming_direction;
  const chosenWorld = worlds.worlds.find((world) => world.naming_direction === chosenName);
  const busy = pending !== null;
  const hasFive = worlds.worlds.some((world) => world.id === "w4");

  async function send(action: WorldsAction) {
    setPending(action.action);
    setError(null);
    try {
      const { project, applyModuleResponse } = store.getState();
      const response = await fetch(`/api/projects/${project.id}/modules/five_worlds`, {
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
      const parsed = WorldsActionResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError("We couldn't read the studio's answer. Your previous work is safe.");
        return;
      }
      applyModuleResponse(parsed.data);
      setCombineIds([]);
      setCombineNote("");
      setReviseFor(null);
      setReviseText("");
    } catch {
      setError("We couldn't reach the studio. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  const toggleCombine = (id: string) =>
    setCombineIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id].slice(-2),
    );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          One idea, {hasFive ? "five" : "three"} worlds
        </h2>
        <p className="font-display text-2xl leading-tight text-balance sm:text-3xl">
          Same strategy. Which brand should it become?
        </p>
        <p className="text-sm text-muted-foreground text-pretty">
          Every world serves the direction you already chose. What changes is how it feels, sounds
          and looks.
        </p>
        {worlds.note ? (
          <p className="mt-1 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
            {worlds.note}
          </p>
        ) : null}
      </header>

      {error ? <ErrorState message={error} /> : null}
      {busy ? <LoadingStatus message={ACTION_MESSAGES[pending]} /> : null}

      <ul className="grid gap-4 xl:grid-cols-3">
        {worlds.worlds.map((world) => {
          const checks = worlds.checks.find((entry) => entry.world_id === world.id);
          const chosen = chosenWorld?.id === world.id;
          const selectedForCombine = combineIds.includes(world.id);

          return (
            <li key={world.id}>
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
                      {world.id === "merged" ? "Combined" : `World ${world.id.toUpperCase()}`}
                    </span>
                    {chosen ? (
                      <span className="flex items-center gap-1 rounded-full bg-brand px-2.5 py-0.5 text-[0.7rem] text-background">
                        <CheckIcon className="size-3" aria-hidden strokeWidth={3} />
                        Your choice
                      </span>
                    ) : null}
                  </div>
                  <h3 className="font-display text-2xl leading-tight">{world.name}</h3>
                  <p className="text-sm leading-relaxed text-pretty">{world.summary}</p>
                </header>

                <Specimen world={world} />
                <Swatches world={world} />
                <CheckNotes checks={checks} />

                <ul className="flex flex-wrap gap-1.5">
                  {world.personality.map((trait) => (
                    <li
                      key={trait}
                      className="rounded-full border border-border px-2 py-0.5 text-[0.7rem]"
                    >
                      {trait}
                    </li>
                  ))}
                </ul>

                <dl className="flex flex-col gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Naming direction</dt>
                    <dd>{world.naming_direction}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Sample names</dt>
                    <dd className="flex flex-col gap-1 pt-0.5">
                      {world.sample_names.map((entry) => (
                        <span key={entry.name}>
                          <span className="font-medium">{entry.name}</span> — {entry.rationale}
                        </span>
                      ))}
                      <span className="text-[0.7rem] text-muted-foreground italic">
                        Check availability and trademarks before using any name.
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Voice rules</dt>
                    <dd>
                      <ul className="flex flex-col gap-0.5 pt-0.5">
                        {world.voice_rules.map((rule) => (
                          <li key={rule}>· {rule}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">How it would be read</dt>
                    <dd>{world.audience_perception}</dd>
                  </div>
                </dl>

                <div className="flex flex-col gap-1 text-xs">
                  <p className="text-muted-foreground">Risks</p>
                  <ul className="flex flex-col gap-1">
                    {world.risks.map((risk) => (
                      <li key={risk} className="leading-snug text-muted-foreground">
                        − {risk}
                      </li>
                    ))}
                  </ul>
                </div>

                {world.obvious_ideas_rejected.length > 0 ? (
                  <details className="group rounded-lg border border-border/70 bg-background/60">
                    <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <span className="flex items-center justify-between">
                        What we ruled out
                        <span className="text-muted-foreground group-open:hidden">Show</span>
                        <span className="hidden text-muted-foreground group-open:inline">Hide</span>
                      </span>
                    </summary>
                    <ul className="flex flex-col gap-1.5 border-t border-border/70 px-3 py-2.5">
                      {world.obvious_ideas_rejected.map((idea) => (
                        <li key={idea} className="text-xs leading-snug text-muted-foreground">
                          {idea}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void send({
                        action: "choose",
                        world_id: world.id,
                        lock,
                        expected_version: version,
                      })
                    }
                  >
                    {chosen ? "Keep this world" : "Choose"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => toggleCombine(world.id)}
                  >
                    {selectedForCombine ? "Selected" : "Combine"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      setReviseFor((current) => (current === world.id ? null : world.id))
                    }
                  >
                    <WandSparklesIcon className="size-3.5" aria-hidden />
                    Revise
                  </Button>
                </div>

                {reviseFor === world.id ? (
                  <div className="flex flex-col gap-2">
                    <label htmlFor={`revise-${world.id}`} className="text-xs text-muted-foreground">
                      What should change about this world?
                    </label>
                    <Textarea
                      id={`revise-${world.id}`}
                      rows={2}
                      value={reviseText}
                      onChange={(event) => setReviseText(event.target.value)}
                      placeholder="e.g. keep the idea but make the palette warmer"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || reviseText.trim().length === 0}
                      onClick={() =>
                        void send({
                          action: "revise",
                          world_id: world.id,
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
            Lock the identity when I choose
          </label>
          <span className="text-xs text-muted-foreground">
            Locked decisions cannot be changed by later steps, including the Anti-Generic Engine.
          </span>
        </div>

        {combineIds.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Combining{" "}
              {combineIds.length === 2
                ? combineIds.map((id) => id.toUpperCase()).join(" + ")
                : "one world — pick one more"}
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
                    world_ids: combineIds as ["w1", "w2"],
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || hasFive}
            onClick={() => void send({ action: "explore" })}
          >
            <PlusIcon className="size-3.5" aria-hidden />
            {hasFive ? "All five worlds are here" : "Explore 2 more worlds"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void send({ action: "regenerate" })}
          >
            <RefreshCwIcon className="size-3.5" aria-hidden />
            Try three different worlds
          </Button>
        </div>
      </section>
    </div>
  );
}

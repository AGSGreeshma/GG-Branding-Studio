"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, CheckCircle2Icon, SparklesIcon } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { LoadingStatus } from "@/components/loading-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COMPLETION_MESSAGE, MAX_INTERVIEW_QUESTIONS } from "@/lib/services/interview";
import type { InterviewTurn } from "@/lib/schemas/interview";
import { useBrandStore } from "@/state/brand-store";

/*
 * The interview as cards, not a chat wall (plan §9, §10, H8).
 * One question at a time, with "why I'm asking", tappable suggested answers and
 * a free-text box. Earlier questions and answers are collapsed above.
 */

interface QaPair {
  question: InterviewTurn;
  answer: InterviewTurn;
}

/** Pairs each answered question with its answer, oldest first. */
function answeredPairs(turns: InterviewTurn[]): QaPair[] {
  const pairs: QaPair[] = [];
  for (let i = 0; i < turns.length - 1; i++) {
    const question = turns[i]!;
    const answer = turns[i + 1]!;
    if (question.role === "assistant" && answer.role === "user") pairs.push({ question, answer });
  }
  return pairs;
}

export function InterviewPanel() {
  const turns = useBrandStore((state) => state.turns);
  const status = useBrandStore((state) => state.status);
  const error = useBrandStore((state) => state.error);
  const complete = useBrandStore((state) => state.complete);
  const completionReason = useBrandStore((state) => state.completionReason);
  const declined = useBrandStore((state) => state.declined);
  const questionsAsked = useBrandStore((state) => state.questionsAsked);
  const answer = useBrandStore((state) => state.answer);
  const skip = useBrandStore((state) => state.skip);
  const retry = useBrandStore((state) => state.retry);
  const begin = useBrandStore((state) => state.begin);

  const [draft, setDraft] = useState("");
  const started = useRef(false);

  // A fresh project has no turns yet: ask the first question as soon as it opens.
  useEffect(() => {
    if (started.current) return;
    if (turns.length === 0 && !complete && status === "idle") {
      started.current = true;
      void begin();
    }
  }, [turns.length, complete, status, begin]);

  const last = turns[turns.length - 1];
  const current = last?.role === "assistant" ? last : null;
  const waitingForAnswer = current !== null && !complete;
  const thinking = status === "thinking";
  const pairs = answeredPairs(turns);

  const submit = async () => {
    const text = draft.trim();
    if (!text || thinking) return;
    setDraft("");
    await answer(text);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Understanding your idea
        </h2>
        {!complete ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            Question{" "}
            {Math.min(questionsAsked + (waitingForAnswer ? 0 : 1), MAX_INTERVIEW_QUESTIONS)} of up to{" "}
            {MAX_INTERVIEW_QUESTIONS}
          </span>
        ) : null}
      </header>

      {pairs.length > 0 ? (
        <details className="group rounded-xl border border-border bg-card/60">
          <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <span className="flex items-center justify-between gap-2">
              <span>
                {pairs.length} earlier {pairs.length === 1 ? "answer" : "answers"}
              </span>
              <span className="text-xs font-normal text-muted-foreground group-open:hidden">
                Show
              </span>
              <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">
                Hide
              </span>
            </span>
          </summary>
          <ol className="flex flex-col gap-4 border-t border-border px-4 py-4">
            {pairs.map((pair) => (
              <li key={pair.question.id} className="flex flex-col gap-1">
                <p className="text-sm text-muted-foreground">{pair.question.content}</p>
                <p className="text-sm leading-relaxed">{pair.answer.content}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => void retry()} /> : null}

      {complete ? (
        <div className="flex flex-col gap-2 rounded-xl border border-brand/40 bg-brand-soft/50 p-5">
          <p className="flex items-center gap-2 font-display text-2xl">
            <CheckCircle2Icon className="size-5 text-brand" aria-hidden />
            Discovery complete
          </p>
          <p className="text-sm leading-relaxed text-pretty">
            {completionReason ? COMPLETION_MESSAGE[completionReason] : COMPLETION_MESSAGE.confidence}
          </p>
          <p className="text-sm text-muted-foreground text-pretty">
            Your Brand Context is on the right. The next step in your workflow arrives in the next
            build.
          </p>
        </div>
      ) : current ? (
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <h3 className="font-display text-2xl leading-tight text-balance sm:text-3xl">
              {current.content}
            </h3>
            {current.question_reason ? (
              <p className="flex items-start gap-2 text-sm text-muted-foreground text-pretty">
                <SparklesIcon className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="sr-only">Why I am asking: </span>
                  {current.question_reason}
                </span>
              </p>
            ) : null}
          </div>

          {declined ? (
            <p className="text-sm text-muted-foreground">
              Start a new project from the home page to describe something else.
            </p>
          ) : (
            <>
              {current.suggested_answers.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">Tap one, or write your own.</p>
                  <ul className="flex flex-wrap gap-2">
                    {current.suggested_answers.map((suggestion) => (
                      <li key={suggestion}>
                        <button
                          type="button"
                          disabled={thinking}
                          onClick={() => void answer(suggestion)}
                          className="rounded-full border border-border bg-background px-3.5 py-1.5 text-sm transition-colors outline-none hover:border-brand hover:text-brand focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                        >
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                <label htmlFor="interview-answer" className="sr-only">
                  Your answer
                </label>
                <Textarea
                  id="interview-answer"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                  disabled={thinking}
                  rows={3}
                  placeholder="Answer in your own words…"
                  className="resize-y"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={thinking}
                    onClick={() => void skip()}
                  >
                    That&apos;s enough, continue
                  </Button>
                  <Button
                    type="button"
                    disabled={thinking || draft.trim().length === 0}
                    onClick={() => void submit()}
                  >
                    Send answer
                    <ArrowRightIcon className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : thinking ? null : (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            The first question is on its way. If nothing appears, use Try again above.
          </p>
        </div>
      )}

      {thinking ? (
        <LoadingStatus
          message={turns.length === 0 ? "Understanding your idea…" : "Thinking about your answer…"}
        />
      ) : null}
    </div>
  );
}

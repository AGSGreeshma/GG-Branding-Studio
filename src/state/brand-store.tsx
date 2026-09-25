"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { BrandContext } from "@/lib/schemas/brand-context";
import { ErrorBodySchema } from "@/lib/schemas/errors";
import {
  InterviewResponseSchema,
  type CompletionReason,
  type InterviewRequest,
  type InterviewTurn,
} from "@/lib/schemas/interview";
import type { ProjectSummary } from "@/lib/schemas/project";
import type { WorkflowPlan } from "@/lib/schemas/workflow";

/*
 * Client workspace state (plan §18.2). Holds the project, the Brand Context and
 * the interview turns, and drives the one-request-per-turn interview loop.
 *
 * The store is created per mount from the server-rendered snapshot rather than
 * as a module singleton: Zustand v5 serves getInitialState() during SSR, so a
 * singleton would render the first paint with empty state and hydrate late.
 */

export interface WorkspaceSnapshot {
  project: ProjectSummary;
  context: BrandContext;
  version: number;
  turns: InterviewTurn[];
  plan: WorkflowPlan;
}

type Status = "idle" | "thinking" | "error";

export interface BrandState extends WorkspaceSnapshot {
  status: Status;
  /** User-safe message from the API (plan §18.5). Never a stack trace. */
  error: string | null;
  complete: boolean;
  completionReason: CompletionReason | null;
  declined: boolean;
  questionsAsked: number;
  /** Asks the first question when a fresh project opens. */
  begin: () => Promise<void>;
  answer: (text: string) => Promise<void>;
  skip: () => Promise<void>;
  retry: () => Promise<void>;
}

const PENDING_PREFIX = "pending-";

const GENERIC_ERROR = "We couldn't complete this AI step. Your previous work is safe.";

async function readError(response: Response): Promise<string> {
  const parsed = ErrorBodySchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : GENERIC_ERROR;
}

export function countQuestions(turns: InterviewTurn[]): number {
  return turns.filter((turn) => turn.role === "assistant" && turn.question_reason !== null).length;
}

export function createBrandStore(snapshot: WorkspaceSnapshot): StoreApi<BrandState> {
  return createStore<BrandState>()((set, get) => {
    let lastRequest: InterviewRequest = {};

    async function send(body: InterviewRequest): Promise<void> {
      const state = get();
      if (state.status === "thinking" || state.complete) return;
      lastRequest = body;
      const baseTurns = state.turns.filter((turn) => !turn.id.startsWith(PENDING_PREFIX));
      set({ status: "thinking", error: null });

      // Optimistic: the user's own words appear immediately, the question follows.
      if (body.answer) {
        set({
          turns: [
            ...baseTurns,
            {
              id: `${PENDING_PREFIX}${Date.now()}`,
              role: "user",
              content: body.answer,
              question_reason: null,
              suggested_answers: [],
              created_at: new Date().toISOString(),
            },
          ],
        });
      }

      try {
        const response = await fetch(`/api/projects/${state.project.id}/interview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          set({ status: "error", error: await readError(response) });
          return;
        }
        const parsed = InterviewResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          set({ status: "error", error: GENERIC_ERROR });
          return;
        }
        const data = parsed.data;

        // Rebuild from the stored turns, dropping the optimistic copy.
        const turns = [...baseTurns];
        for (const turn of [data.user_turn, data.turn]) {
          if (turn && !turns.some((existing) => existing.id === turn.id)) turns.push(turn);
        }

        set({
          status: "idle",
          error: null,
          turns,
          context: data.context,
          version: data.version,
          plan: data.plan,
          complete: data.complete,
          completionReason: data.completion_reason,
          declined: data.declined,
          questionsAsked: data.questions_asked,
        });
      } catch {
        set({
          status: "error",
          error: "We couldn't reach the studio. Check your connection and try again.",
        });
      }
    }

    return {
      ...snapshot,
      status: "idle",
      error: null,
      complete:
        snapshot.plan.steps.find((step) => step.module === "interviewer")?.status === "complete",
      completionReason: null,
      declined: false,
      questionsAsked: countQuestions(snapshot.turns),

      begin: () => send({}),
      answer: (text) => send({ answer: text }),
      skip: () => send({ skip: true }),
      retry: () => send(lastRequest),
    };
  });
}

const BrandStoreContext = createContext<StoreApi<BrandState> | null>(null);

export function BrandStoreProvider({
  snapshot,
  children,
}: {
  snapshot: WorkspaceSnapshot;
  children: ReactNode;
}) {
  // useState's lazy initialiser: one store per mount, created before the first
  // render so SSR and hydration both read the server snapshot.
  const [store] = useState(() => createBrandStore(snapshot));
  return <BrandStoreContext value={store}>{children}</BrandStoreContext>;
}

export function useBrandStore<T>(selector: (state: BrandState) => T): T {
  const store = useContext(BrandStoreContext);
  if (!store) throw new Error("useBrandStore must be used inside a BrandStoreProvider");
  return useStore(store, selector);
}

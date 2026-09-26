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
import type { AntiGenericResult } from "@/lib/schemas/outputs/anti-generic";
import type { BattleResult } from "@/lib/schemas/outputs/battle";
import type { WorldsResult } from "@/lib/schemas/outputs/worlds";
import type { WorkflowEvent } from "@/lib/services/events";
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
  /** The current Brand Battle, if one has run (plan §14.3). */
  battle: BattleResult | null;
  /** The identity worlds, if they have been explored (plan §14.5). */
  worlds: WorldsResult | null;
  /** The Anti-Generic Engine's rounds, if it has run (plan §14.6). */
  antiGeneric: AntiGenericResult | null;
}

/** One line in the workspace activity log while a module runs (plan §18.4). */
export interface ActivityLine {
  id: string;
  kind: "progress" | "agent" | "finding";
  text: string;
  severity?: "low" | "medium" | "high";
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

  /** Module run state, driven by the workflow event stream. */
  workflowStatus: "idle" | "running" | "error";
  /** The current loading message, from module.started / module.progress. */
  workflowMessage: string | null;
  workflowError: string | null;
  activity: ActivityLine[];
  /** Set when the module needs the user to decide (plan §11.4). */
  decisionPrompt: string | null;
  planFallbackReason: string | null;

  /** Asks the first question when a fresh project opens. */
  begin: () => Promise<void>;
  answer: (text: string) => Promise<void>;
  skip: () => Promise<void>;
  retry: () => Promise<void>;

  /** Applies one streamed workflow event (E10). */
  applyEvent: (event: WorkflowEvent) => void;
  startWorkflow: () => void;
  failWorkflow: (message: string) => void;
  finishWorkflow: () => void;
  setBattle: (battle: BattleResult) => void;
  /** Applies any module action response: new result, context, version and plan. */
  applyModuleResponse: (payload: {
    battle?: BattleResult;
    worlds?: WorldsResult;
    anti_generic?: AntiGenericResult;
    context: BrandContext;
    version: number;
    plan: WorkflowPlan;
  }) => void;
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

      workflowStatus: "idle",
      workflowMessage: null,
      workflowError: null,
      activity: [],
      decisionPrompt: null,
      planFallbackReason: null,

      startWorkflow: () =>
        set({
          workflowStatus: "running",
          workflowError: null,
          workflowMessage: "Planning your next step…",
          activity: [],
          decisionPrompt: null,
        }),
      failWorkflow: (message) =>
        set({ workflowStatus: "error", workflowError: message, workflowMessage: null }),
      finishWorkflow: () =>
        set((state) =>
          state.workflowStatus === "running"
            ? { workflowStatus: "idle", workflowMessage: null }
            : state,
        ),
      setBattle: (battle) => set({ battle }),
      applyModuleResponse: (payload) =>
        set((state) => ({
          battle: payload.battle ?? state.battle,
          worlds: payload.worlds ?? state.worlds,
          antiGeneric: payload.anti_generic ?? state.antiGeneric,
          context: payload.context,
          version: payload.version,
          plan: payload.plan,
          workflowStatus: "idle",
          workflowMessage: null,
          workflowError: null,
        })),

      applyEvent: (event) =>
        set((state) => {
          const addActivity = (line: ActivityLine): ActivityLine[] =>
            [...state.activity, line].slice(-12);

          switch (event.type) {
            case "workflow.planned":
              return {
                plan: event.plan,
                planFallbackReason: event.fallback_used ? event.fallback_reason : null,
                workflowMessage: "Your workflow is ready.",
              };
            case "module.started":
              return { workflowMessage: event.label, decisionPrompt: null };
            case "module.progress":
              return {
                workflowMessage: event.message,
                activity: addActivity({
                  id: `p-${state.activity.length}`,
                  kind: "progress",
                  text: event.message,
                }),
              };
            case "agent.completed":
              return {
                activity: addActivity({
                  id: `a-${state.activity.length}`,
                  kind: "agent",
                  text: `${event.agent} — ${event.summary}`,
                }),
              };
            case "critique.finding":
              return {
                activity: addActivity({
                  id: `f-${state.activity.length}`,
                  kind: "finding",
                  text: event.detail,
                  severity: event.severity,
                }),
              };
            case "module.completed":
              return {
                plan: event.plan,
                battle: event.battle ?? state.battle,
                worlds: event.worlds ?? state.worlds,
                antiGeneric: event.anti_generic ?? state.antiGeneric,
                workflowStatus: "idle",
                workflowMessage: null,
              };
            case "decision.required":
              return { decisionPrompt: event.prompt, workflowStatus: "idle", workflowMessage: null };
            case "context.updated":
              return { version: event.version };
            case "error":
              return {
                workflowStatus: "error",
                workflowError: event.error.message,
                workflowMessage: null,
              };
            default:
              return state;
          }
        }),

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
  return useStore(useBrandStoreApi(), selector);
}

/** The store itself, for callers that need getState() outside a render. */
export function useBrandStoreApi(): StoreApi<BrandState> {
  const store = useContext(BrandStoreContext);
  if (!store) throw new Error("useBrandStore must be used inside a BrandStoreProvider");
  return store;
}

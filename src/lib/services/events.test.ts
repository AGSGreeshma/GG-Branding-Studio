import { describe, expect, it } from "vitest";
import { defaultPlanFor } from "./workflow-engine";
import { encodeEvent, parseSse, type WorkflowEvent } from "./events";

/*
 * SSE encoder and client parser (plan §18.4, E10). The same union is used on
 * both sides, so a round trip is the contract.
 */

const plan = defaultPlanFor("idea");

const events: WorkflowEvent[] = [
  { type: "workflow.planned", plan, fallback_used: false, fallback_reason: null },
  {
    type: "module.started",
    run_id: null,
    module: "brand_battle",
    label: "Competing three strategic directions…",
  },
  { type: "module.progress", run_id: "run-1", message: "Skeptic is challenging Direction B…" },
  {
    type: "agent.completed",
    run_id: "run-1",
    parent_run_id: null,
    agent: "Strategist",
    summary: "Direction A: The Reliability Record",
  },
  {
    type: "critique.finding",
    run_id: "run-1",
    target_path: "battle.c",
    kind: "cliche",
    severity: "medium",
    detail: "commitment layer",
  },
  { type: "context.updated", version: 4, changed_paths: ["positioning.statement"] },
  {
    type: "decision.required",
    decision_id: "battle:run-1",
    prompt: "Which direction should this brand take?",
    options: ["A", "B", "C"],
  },
  {
    type: "error",
    error: {
      code: "AI_PROVIDER_UNAVAILABLE",
      message: "The AI service is unavailable right now.",
      retryable: true,
      request_id: "req-1",
    },
  },
];

describe("SSE round trip", () => {
  it("encodes and parses every event type unchanged", () => {
    const buffer = events.map(encodeEvent).join("");
    const { events: parsed, rest } = parseSse(buffer);

    expect(parsed).toEqual(events);
    expect(rest).toBe("");
  });

  it("names the event on the frame, so the wire format is readable SSE", () => {
    const frame = encodeEvent(events[1]!);
    expect(frame.startsWith("event: module.started\ndata: {")).toBe(true);
    expect(frame.endsWith("\n\n")).toBe(true);
  });

  it("keeps a half-arrived frame back until the rest of it lands", () => {
    const buffer = events.map(encodeEvent).join("");
    const cut = buffer.length - 20;

    const first = parseSse(buffer.slice(0, cut));
    expect(first.events).toHaveLength(events.length - 1);

    const second = parseSse(first.rest + buffer.slice(cut));
    expect(second.events).toEqual([events[events.length - 1]]);
  });

  it("drops frames that are not valid events instead of failing the stream", () => {
    const buffer = [
      "event: junk\ndata: not json\n\n",
      'event: module.progress\ndata: {"type":"module.progress"}\n\n',
      encodeEvent(events[2]!),
    ].join("");

    const { events: parsed } = parseSse(buffer);

    expect(parsed).toEqual([events[2]]);
  });

  it("ignores comment and retry lines a proxy may inject", () => {
    const buffer = `: keep-alive\n\nretry: 1000\n\n${encodeEvent(events[5]!)}`;
    expect(parseSse(buffer).events).toEqual([events[5]]);
  });
});

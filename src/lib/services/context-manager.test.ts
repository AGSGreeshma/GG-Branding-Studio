import { describe, expect, it } from "vitest";
import { emptyBrandContext } from "@/lib/schemas/brand-context";
import type { ExtractedUpdate, InterviewerOutput } from "@/lib/schemas/outputs/interviewer";
import {
  applyExtractedUpdates,
  applyInterviewerOutput,
  isPathLocked,
  sliceForInterviewer,
} from "./context-manager";

const options = {
  agent: "interviewer",
  source: "user" as const,
  runId: "run-1",
  lockedPaths: [] as string[],
};

const updates: ExtractedUpdate[] = [
  { path: "problem.statement", values: ["Students can't tell who is reliable"], evidence: "you can't tell who is reliable" },
  { path: "audience.primary", values: ["College students", "Hackathon teams"], evidence: "college students" },
];

describe("sliceForInterviewer", () => {
  it("passes only the fields the Interviewer needs", () => {
    const slice = sliceForInterviewer(emptyBrandContext({ stage: "idea" }));
    expect(Object.keys(slice).sort()).toEqual([
      "assumptions",
      "audience",
      "open_questions",
      "problem",
      "product",
      "project",
    ]);
  });
});

describe("applyExtractedUpdates", () => {
  it("writes text and list fields and records provenance with the user's evidence", () => {
    const result = applyExtractedUpdates(emptyBrandContext(), updates, options);

    expect(result.context.problem.statement).toBe("Students can't tell who is reliable");
    expect(result.context.audience.primary).toEqual(["College students", "Hackathon teams"]);
    expect(result.changedPaths).toEqual(["problem.statement", "audience.primary"]);

    const provenance = result.context.provenance.find((entry) => entry.path === "audience.primary");
    expect(provenance).toMatchObject({ source: "user", agent: "interviewer", run_id: "run-1" });
    expect(provenance?.derived_from).toEqual(["college students"]);
  });

  it("merges list fields without duplicating what is already there", () => {
    const start = applyExtractedUpdates(emptyBrandContext(), updates, options).context;

    const result = applyExtractedUpdates(
      start,
      [{ path: "audience.primary", values: ["college students", "Club organisers"], evidence: "clubs" }],
      options,
    );

    expect(result.context.audience.primary).toEqual([
      "College students",
      "Hackathon teams",
      "Club organisers",
    ]);
  });

  it("never modifies a locked field, and reports it as blocked", () => {
    const start = applyExtractedUpdates(emptyBrandContext(), updates, options).context;

    const result = applyExtractedUpdates(
      start,
      [
        { path: "problem.statement", values: ["Something the user did not decide"], evidence: "x" },
        { path: "product.description", values: ["A teammate finder"], evidence: "an app" },
      ],
      { ...options, lockedPaths: ["problem.statement"] },
    );

    expect(result.context.problem.statement).toBe("Students can't tell who is reliable");
    expect(result.blockedPaths).toEqual(["problem.statement"]);
    // Unlocked fields in the same batch still apply.
    expect(result.context.product.description).toBe("A teammate finder");
  });

  it("treats a locked section as locking every field inside it", () => {
    const result = applyExtractedUpdates(emptyBrandContext(), updates, {
      ...options,
      lockedPaths: ["audience"],
    });

    expect(result.context.audience.primary).toEqual([]);
    expect(result.blockedPaths).toEqual(["audience.primary"]);
    expect(isPathLocked("audience.primary", ["audience"])).toBe(true);
    expect(isPathLocked("audiences.primary", ["audience"])).toBe(false);
  });

  it("ignores empty values rather than blanking a known field", () => {
    const start = applyExtractedUpdates(emptyBrandContext(), updates, options).context;

    const result = applyExtractedUpdates(
      start,
      [{ path: "problem.statement", values: ["  "], evidence: "" }],
      options,
    );

    expect(result.context.problem.statement).toBe("Students can't tell who is reliable");
    expect(result.changedPaths).toEqual([]);
  });
});

describe("applyInterviewerOutput", () => {
  const output: InterviewerOutput = {
    refusal: null,
    known_information: ["Students struggle to find teammates"],
    missing_information: ["Which courses this covers"],
    assumptions: ["Most users are undergraduates"],
    next_question: "What usually goes wrong?",
    question_reason: "It tells us what to promise.",
    suggested_answers: ["Nobody replies", "People drop out"],
    confidence: [
      { path: "problem.statement", level: "medium" },
      { path: "identity.tagline", level: "high" },
    ],
    extracted_updates: updates,
  };

  it("stores assumptions, open questions and only tracked confidence paths", () => {
    const result = applyInterviewerOutput(emptyBrandContext(), output, options);

    expect(result.context.meta.assumptions).toEqual(["Most users are undergraduates"]);
    expect(result.context.meta.open_questions).toEqual(["Which courses this covers"]);
    expect(result.context.meta.confidence).toEqual([{ path: "problem.statement", level: "medium" }]);
  });

  it("replaces a confidence entry for the same path instead of appending", () => {
    const first = applyInterviewerOutput(emptyBrandContext(), output, options).context;

    const second = applyInterviewerOutput(
      first,
      { ...output, confidence: [{ path: "problem.statement", level: "high" }] },
      options,
    ).context;

    expect(second.meta.confidence).toEqual([{ path: "problem.statement", level: "high" }]);
  });
});

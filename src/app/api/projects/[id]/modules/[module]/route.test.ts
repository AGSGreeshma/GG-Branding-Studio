import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBrandContext, type BrandContext } from "@/lib/schemas/brand-context";
import { AppError } from "@/lib/schemas/errors";
import type { BattleResult } from "@/lib/schemas/outputs/battle";
import type { WorkflowPlan } from "@/lib/schemas/workflow";
import { defaultPlanFor } from "@/lib/services/workflow-engine";
import generateFixture from "../../../../../../../scripts/stub/fixtures/battle_generate.json";

/*
 * Choosing a Brand Battle direction (K11, K12). The decision writes positioning
 * into the Brand Context — except where the user has locked it (plan §11.2).
 */

const OWNER = "guest-owner";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

interface Store {
  callerOwnerId: string;
  context: BrandContext;
  version: number;
  lockedPaths: string[];
  plan: WorkflowPlan;
  workflowState: string;
  battle: BattleResult | null;
  decisions: Array<{ path: string; locked: boolean; source: string }>;
  savedBattles: BattleResult[];
}

const store = vi.hoisted(() => ({ current: null as unknown as Store }));

vi.mock("@/lib/session", () => ({ getOwnerId: async () => store.current.callerOwnerId }));

const fakeTrace = {
  agent: "battle_generate",
  model: "test-primary-model",
  promptVersion: "1.0.0",
  tokensIn: 700,
  tokensOut: 1600,
  latencyMs: 24000,
  retryCount: 0,
  errorCode: null,
};

// The agents themselves are covered by their own tests; here they only need to
// answer so the route's persistence and plan handling can be checked.
vi.mock("@/lib/agents/battle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/battle")>();
  return {
    ...actual,
    runBattleGenerate: vi.fn(async () => ({
      directions: store.current.battle?.directions ?? [],
      trace: fakeTrace,
    })),
    runBattleMerge: vi.fn(),
    runBattleRevise: vi.fn(),
  };
});

vi.mock("@/lib/db/queries", () => ({
  getProject: async (ownerId: string, id: string) => {
    if (id !== PROJECT_ID || ownerId !== OWNER) {
      throw new AppError("NOT_FOUND", { message: "not found for owner" });
    }
    return {
      id: PROJECT_ID,
      ownerId: OWNER,
      name: "Teammate Finder",
      entryStage: "idea" as const,
      brandState: "unbranded" as const,
      status: "active" as const,
      workflowState: store.current.workflowState,
      currentPlanJson: store.current.plan,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },
  getLatestContext: async () => ({ context: store.current.context, version: store.current.version }),
  getLockedPaths: async () => store.current.lockedPaths,
  getModuleResult: async () => store.current.battle,
  saveModuleResult: async (_p: string, _m: string, result: BattleResult) => {
    store.current.savedBattles.push(result);
    store.current.battle = result;
  },
  saveContext: async (_p: string, context: BrandContext, expectedVersion: number) => {
    if (expectedVersion !== store.current.version) {
      throw new AppError("CONFLICT", { message: "version mismatch" });
    }
    store.current.context = context;
    store.current.version = expectedVersion + 1;
    return { context, version: store.current.version };
  },
  saveDecision: async (input: { path: string; locked: boolean; source: string }) => {
    store.current.decisions.push(input);
    return "decision-1";
  },
  recordRun: async () => "run-1",
  updateProjectWorkflow: async (
    _p: string,
    update: { plan?: WorkflowPlan; workflowState?: string },
  ) => {
    if (update.plan) store.current.plan = update.plan;
    if (update.workflowState) store.current.workflowState = update.workflowState;
  },
}));

const { POST } = await import("./route");

const directions = generateFixture.outputs[0]!.directions as BattleResult["directions"];

function post(body: unknown, module = "brand_battle") {
  const request = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/modules/${module}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id: PROJECT_ID, module }) });
}

beforeEach(() => {
  store.current = {
    callerOwnerId: OWNER,
    context: {
      ...emptyBrandContext({ stage: "idea" }),
      positioning: {
        category: "",
        statement: "A positioning the user wrote themselves",
        differentiator: "",
        competitive_angle: "",
        value_proposition: "",
      },
    },
    version: 4,
    lockedPaths: [],
    plan: defaultPlanFor("idea"),
    workflowState: "USER_DECISION",
    battle: { directions, critique: null, divergence_note: null, run_id: "run-battle" },
    decisions: [],
    savedBattles: [],
  };
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/projects/[id]/modules/brand_battle — choose", () => {
  it("writes the direction into the Brand Context and advances the plan", async () => {
    const response = await post({
      action: "choose",
      direction_id: "a",
      lock: false,
      expected_version: 4,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.context.selected_direction).toMatchObject({
      name: "The Reliability Record",
      source_module: "brand_battle",
      run_id: "run-battle",
    });
    expect(body.context.positioning.statement).toBe(directions[0]!.positioning.statement);
    expect(body.context.personality.traits).toEqual(directions[0]!.personality);
    expect(body.version).toBe(5);
    expect(body.chosen_direction_id).toBe("a");
    const statusOf = (module: string) =>
      body.plan.steps.find((step: { module: string }) => step.module === module).status;
    // The decision belongs to the critique step, so choosing closes both (ADR-023).
    expect(statusOf("brand_battle")).toBe("complete");
    expect(statusOf("battle_critique")).toBe("complete");
    expect(store.current.workflowState).toBe("WORKFLOW_PLANNING");
  });

  it("records provenance for every path it wrote", async () => {
    await post({ action: "choose", direction_id: "b", lock: false, expected_version: 4 });

    const paths = store.current.context.provenance.map((entry) => entry.path);
    expect(paths).toContain("positioning.statement");
    expect(paths).toContain("selected_direction");
    const entry = store.current.context.provenance.find(
      (item) => item.path === "positioning.statement",
    );
    expect(entry).toMatchObject({ source: "agent", agent: "brand_battle", run_id: "run-battle" });
  });

  it("never overwrites a locked path, and writes the unlocked ones", async () => {
    store.current.lockedPaths = ["positioning.statement"];

    const body = await (
      await post({ action: "choose", direction_id: "a", lock: false, expected_version: 4 })
    ).json();

    expect(body.context.positioning.statement).toBe("A positioning the user wrote themselves");
    expect(body.blocked_paths).toEqual(["positioning.statement"]);
    expect(body.context.positioning.category).toBe(directions[0]!.positioning.category);
    expect(body.context.selected_direction).not.toBeNull();
  });

  it("treats a locked section as locking every field inside it", async () => {
    store.current.lockedPaths = ["positioning"];

    const body = await (
      await post({ action: "choose", direction_id: "a", lock: false, expected_version: 4 })
    ).json();

    expect(body.context.positioning.category).toBe("");
    expect(body.blocked_paths).toEqual([
      "positioning.category",
      "positioning.statement",
      "positioning.differentiator",
      "positioning.value_proposition",
    ]);
  });

  it("records a locked decision when the user asks to lock the choice", async () => {
    await post({ action: "choose", direction_id: "a", lock: true, expected_version: 4 });

    expect(store.current.decisions.length).toBeGreaterThan(0);
    expect(store.current.decisions.every((decision) => decision.locked)).toBe(true);
    expect(store.current.decisions[0]!.source).toBe("ai_accepted");
  });

  it("refuses a stale context version instead of overwriting newer work", async () => {
    const response = await post({
      action: "choose",
      direction_id: "a",
      lock: false,
      expected_version: 2,
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");
    expect(store.current.version).toBe(4);
  });

  it("rejects a direction that is not part of this battle", async () => {
    const response = await post({
      action: "choose",
      direction_id: "merged",
      lock: false,
      expected_version: 4,
    });

    expect(response.status).toBe(422);
  });

  it("hides another guest's project behind a 404", async () => {
    store.current.callerOwnerId = "guest-intruder";

    const response = await post({
      action: "choose",
      direction_id: "a",
      lock: false,
      expected_version: 4,
    });

    expect(response.status).toBe(404);
    expect(store.current.version).toBe(4);
  });

  it("hands the critique back to the workflow after a fresh battle", async () => {
    const response = await post({ action: "regenerate", note: "None of these fit our tone." });
    const body = await response.json();

    expect(response.status).toBe(200);
    const statusOf = (module: string) =>
      body.plan.steps.find((step: { module: string }) => step.module === module).status;
    expect(statusOf("brand_battle")).toBe("complete");
    // Pending, not skipped: the client runs the critique step next (ADR-023).
    expect(statusOf("battle_critique")).toBe("pending");
    expect(store.current.workflowState).toBe("POSITIONING");
  });

  it("refuses a module that has no runner yet", async () => {
    const response = await post({ action: "regenerate" }, "five_worlds");

    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toContain("next build");
  });
});

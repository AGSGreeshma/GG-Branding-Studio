import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBrandContext } from "@/lib/schemas/brand-context";
import { AppError } from "@/lib/schemas/errors";
import { defaultPlanFor } from "@/lib/services/workflow-engine";

/*
 * Reading a project is owner-scoped too (W3, W8, V14): another guest cookie
 * gets 404, not 403, so project ids cannot be probed.
 */

const OWNER = "guest-owner";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

const store = vi.hoisted(() => ({ callerOwnerId: "guest-owner" }));

vi.mock("@/lib/session", () => ({ getOwnerId: async () => store.callerOwnerId }));

vi.mock("@/lib/db/queries", () => ({
  getProject: async (ownerId: string, id: string) => {
    if (id !== PROJECT_ID || ownerId !== OWNER) {
      throw new AppError("NOT_FOUND", { message: "not found for owner" });
    }
    return {
      id: PROJECT_ID,
      ownerId: OWNER,
      name: "New idea",
      entryStage: "idea" as const,
      brandState: "unbranded" as const,
      status: "active" as const,
      workflowState: "DISCOVERY" as const,
      currentPlanJson: defaultPlanFor("idea"),
      shareSlug: null,
      archivedAt: null,
      createdAt: new Date("2026-09-25T10:00:00Z"),
      updatedAt: new Date("2026-09-25T10:05:00Z"),
    };
  },
  getLatestContext: async () => ({ context: emptyBrandContext({ stage: "idea" }), version: 1 }),
  listInterviewTurns: async () => [],
}));

const { GET } = await import("./route");

function get(id = PROJECT_ID) {
  return GET(new NextRequest(`http://localhost/api/projects/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  store.callerOwnerId = OWNER;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("GET /api/projects/[id]", () => {
  it("returns the project, its context and its turns to its owner", async () => {
    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project).toMatchObject({ id: PROJECT_ID, entry_stage: "idea" });
    expect(body.project.plan.steps[0].module).toBe("interviewer");
    expect(body.version).toBe(1);
    expect(body.turns).toEqual([]);
  });

  it("returns 404 for another guest", async () => {
    store.callerOwnerId = "guest-intruder";

    const response = await get();

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });
});

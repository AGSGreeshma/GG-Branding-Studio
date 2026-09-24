import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "gg_uid" && cookieJar.value !== undefined
        ? { name, value: cookieJar.value }
        : undefined,
  }),
}));

import { getOwnerId, signOwnerId, verifySessionToken } from "./session";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const OWNER = "3f1c2b8e-9a4d-4c7e-8b21-6d5f0a9e1c34";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", SECRET);
  cookieJar.value = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session token", () => {
  it("round-trips: a signed id verifies back to the same id", async () => {
    const token = await signOwnerId(OWNER, SECRET);
    expect(token.startsWith(`${OWNER}.`)).toBe(true);
    await expect(verifySessionToken(token, SECRET)).resolves.toBe(OWNER);
  });

  it("rejects a token whose id was swapped", async () => {
    const token = await signOwnerId(OWNER, SECRET);
    const otherOwner = "00000000-0000-4000-8000-000000000000";
    const tampered = `${otherOwner}${token.slice(OWNER.length)}`;
    await expect(verifySessionToken(tampered, SECRET)).resolves.toBeNull();
  });

  it("rejects a token whose signature was altered", async () => {
    const token = await signOwnerId(OWNER, SECRET);
    const last = token.at(-1) === "A" ? "B" : "A";
    await expect(verifySessionToken(token.slice(0, -1) + last, SECRET)).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signOwnerId(OWNER, "another-secret-that-is-also-32-chars-long!!");
    await expect(verifySessionToken(token, SECRET)).resolves.toBeNull();
  });

  it("rejects malformed tokens", async () => {
    for (const bad of [undefined, "", "no-dot", `${OWNER}.`, `.abc`, `not-a-uuid.abc`, `${OWNER}.***`]) {
      await expect(verifySessionToken(bad, SECRET)).resolves.toBeNull();
    }
  });
});

describe("getOwnerId", () => {
  it("returns the owner id from a valid cookie", async () => {
    cookieJar.value = await signOwnerId(OWNER, SECRET);
    await expect(getOwnerId()).resolves.toBe(OWNER);
  });

  it("throws UNAUTHORIZED for a tampered cookie", async () => {
    const token = await signOwnerId(OWNER, SECRET);
    cookieJar.value = token.replace(OWNER, "00000000-0000-4000-8000-000000000000");
    await expect(getOwnerId()).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("throws UNAUTHORIZED when the cookie is missing", async () => {
    await expect(getOwnerId()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("fails closed when SESSION_SECRET is missing", async () => {
    cookieJar.value = await signOwnerId(OWNER, SECRET);
    vi.stubEnv("SESSION_SECRET", "");
    await expect(getOwnerId()).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

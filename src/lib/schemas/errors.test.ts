import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, ERROR_CODES, ERROR_STATUS, ErrorBodySchema, toErrorResponse } from "./errors";

const SECRET_DETAIL = "postgres://admin:hunter2@db.internal:5432 stack at queries.ts:42";

describe("toErrorResponse", () => {
  it("never leaks the internal message of an AppError", () => {
    const { status, body } = toErrorResponse(
      new AppError("AI_OUTPUT_INVALID", { message: SECRET_DETAIL }),
      "req-1",
    );
    expect(status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(body.error).toEqual({
      code: "AI_OUTPUT_INVALID",
      message: "We couldn't complete this AI step. Your previous work is safe.",
      retryable: true,
      request_id: "req-1",
    });
  });

  it("maps unknown errors to a generic INTERNAL error", () => {
    const { status, body } = toErrorResponse(new Error(SECRET_DETAIL), "req-2");
    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("handles thrown non-Error values", () => {
    const { body } = toErrorResponse(SECRET_DETAIL, "req-3");
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("maps a ZodError to VALIDATION_ERROR without echoing the input", () => {
    const parsed = z.object({ email: z.email() }).safeParse({ email: SECRET_DETAIL });
    expect(parsed.success).toBe(false);
    const { status, body } = toErrorResponse(parsed.error, "req-4");
    expect(status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("does not leak the cause chain", () => {
    const err = new AppError("CONFLICT", { cause: new Error(SECRET_DETAIL) });
    expect(JSON.stringify(toErrorResponse(err, "req-5").body)).not.toContain("hunter2");
  });

  it("uses a deliberate public message when one is given", () => {
    const err = new AppError("NOT_FOUND", {
      message: SECRET_DETAIL,
      publicMessage: "That project does not exist.",
    });
    expect(toErrorResponse(err, "req-6").body.error.message).toBe("That project does not exist.");
  });

  it("returns the plan §18.5 shape and status for every code", () => {
    for (const code of ERROR_CODES) {
      const { status, body } = toErrorResponse(new AppError(code, { message: SECRET_DETAIL }), "r");
      expect(status).toBe(ERROR_STATUS[code]);
      expect(ErrorBodySchema.parse(body)).toEqual(body);
      expect(body.error.message.length).toBeGreaterThan(0);
      expect(body.error.message).not.toContain("hunter2");
    }
  });
});

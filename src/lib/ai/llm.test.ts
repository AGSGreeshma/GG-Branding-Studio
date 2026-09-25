import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Swap the OpenAI provider for the AI SDK mock model. No network calls in tests.
const mocks = vi.hoisted(() => ({ model: null as unknown }));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => mocks.model) }));

import { AiCallError, generateStructured } from "./llm";

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

function reply(text: string): GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 7, text: 7, reasoning: undefined },
    },
    warnings: [],
  };
}

const TestSchema = z.object({ ok: z.boolean(), message: z.string() });

type MockOptions = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>;

function useModel(doGenerate: MockOptions["doGenerate"]) {
  const model = new MockLanguageModelV4({ doGenerate });
  mocks.model = model;
  return model;
}

const baseOptions = {
  agent: "test_agent",
  schema: TestSchema,
  system: "You are a test.",
  prompt: "Say hi.",
  tier: "fast" as const,
  promptVersion: "1.0.0",
};

/** The full prompt the model received on a call, as text. */
function promptText(model: MockLanguageModelV4, call: number): string {
  return JSON.stringify(model.doGenerateCalls[call]?.prompt);
}

beforeEach(() => {
  vi.stubEnv("MODEL_FAST", "test-fast-model");
  vi.stubEnv("MODEL_PRIMARY", "test-primary-model");
  vi.stubEnv("OPENAI_OMIT_TEMPERATURE", "0");
  // Keep test output quiet; logging is covered by the trace assertions.
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateStructured", () => {
  it("returns validated output and a trace for a valid response", async () => {
    const model = useModel(reply('{"ok":true,"message":"hi"}'));

    const { result, trace } = await generateStructured({ ...baseOptions, temperature: 0.3 });

    expect(result).toEqual({ ok: true, message: "hi" });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0]?.temperature).toBe(0.3);
    expect(model.doGenerateCalls[0]?.responseFormat?.type).toBe("json");
    expect(trace).toMatchObject({
      agent: "test_agent",
      model: "test-fast-model",
      promptVersion: "1.0.0",
      tokensIn: 12,
      tokensOut: 7,
      retryCount: 0,
      errorCode: null,
    });
    expect(trace.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("uses MODEL_PRIMARY for the primary tier", async () => {
    useModel(reply('{"ok":true,"message":"hi"}'));
    const { trace } = await generateStructured({ ...baseOptions, tier: "primary" });
    expect(trace.model).toBe("test-primary-model");
  });

  it("repairs invalid output once, sending the validation errors back", async () => {
    const model = useModel([
      reply('{"ok":"yes","message":"hi"}'),
      reply('{"ok":true,"message":"fixed"}'),
    ]);

    const { result, trace } = await generateStructured(baseOptions);

    expect(result).toEqual({ ok: true, message: "fixed" });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(trace.retryCount).toBe(1);
    expect(trace.tokensIn).toBe(24);
    expect(promptText(model, 0)).not.toContain("validation_errors");
    expect(promptText(model, 1)).toContain("<validation_errors>");
    expect(promptText(model, 1)).toContain("ok:");
  });

  it("repairs truncated JSON too", async () => {
    const model = useModel([reply('{"ok":true,"mess'), reply('{"ok":true,"message":"whole"}')]);
    const { result } = await generateStructured(baseOptions);
    expect(result.message).toBe("whole");
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("throws AI_OUTPUT_INVALID after exactly one failed repair", async () => {
    const model = useModel([reply('{"ok":"no"}'), reply("not json at all")]);

    const error = await generateStructured(baseOptions).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AiCallError);
    const aiError = error as AiCallError;
    expect(aiError.code).toBe("AI_OUTPUT_INVALID");
    expect(aiError.status).toBe(502);
    expect(aiError.trace.errorCode).toBe("AI_OUTPUT_INVALID");
    expect(aiError.trace.retryCount).toBe(1);
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("omits temperature when OPENAI_OMIT_TEMPERATURE=1", async () => {
    vi.stubEnv("OPENAI_OMIT_TEMPERATURE", "1");
    const model = useModel(reply('{"ok":true,"message":"hi"}'));

    await generateStructured({ ...baseOptions, temperature: 0.9 });

    expect(model.doGenerateCalls[0]?.temperature).toBeUndefined();
  });

  it("retries a 429 with backoff, then succeeds", async () => {
    let calls = 0;
    const model = useModel(async () => {
      calls++;
      if (calls === 1) {
        throw new APICallError({
          message: "Rate limit",
          url: "https://api.openai.com/v1/responses",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        });
      }
      return reply('{"ok":true,"message":"after retry"}');
    });

    const { result, trace } = await generateStructured(baseOptions);

    expect(result.message).toBe("after retry");
    expect(trace.retryCount).toBe(1);
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("fails fast when the account is out of credit instead of retrying the 429", async () => {
    const model = useModel(async () => {
      throw new APICallError({
        message: "Rate limit",
        url: "https://api.openai.com/v1/responses",
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
        responseBody: JSON.stringify({
          error: { code: "insufficient_quota", message: "You have no credits remaining." },
        }),
      });
    });

    const error = (await generateStructured(baseOptions).catch((err: unknown) => err)) as AiCallError;

    expect(error.code).toBe("AI_PROVIDER_UNAVAILABLE");
    expect(error.retryable).toBe(false);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("maps a non-retryable provider error to AI_PROVIDER_UNAVAILABLE without retrying", async () => {
    const model = useModel(async () => {
      throw new APICallError({
        message: "Invalid API key",
        url: "https://api.openai.com/v1/responses",
        requestBodyValues: {},
        statusCode: 401,
        isRetryable: false,
      });
    });

    const error = (await generateStructured(baseOptions).catch((err: unknown) => err)) as AiCallError;

    expect(error.code).toBe("AI_PROVIDER_UNAVAILABLE");
    expect(error.retryable).toBe(false);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("fails fast with a typed error when the tier model is not configured", async () => {
    vi.stubEnv("MODEL_FAST", "");
    useModel(reply('{"ok":true,"message":"hi"}'));
    await expect(generateStructured(baseOptions)).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
    });
  });
});

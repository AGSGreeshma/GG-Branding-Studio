import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BrandContextSchema, emptyBrandContext } from "./brand-context";
import { PingSchema } from "./outputs/ping";
import { WorkflowPlanSchema } from "./workflow";

/*
 * OpenAI strict structured outputs (plan §20.2, enabled by default in @ai-sdk/openai):
 * every object lists all its properties in `required` and allows no open
 * additionalProperties (records). The AI SDK converts Zod with io: "input",
 * so fields with .optional() or .default() would drop out of `required`.
 */
type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema | JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
};

function strictModeProblems(schema: JsonSchema, path = "$"): string[] {
  const problems: string[] = [];
  if (schema.properties) {
    const keys = Object.keys(schema.properties);
    const required = new Set(schema.required ?? []);
    for (const key of keys) {
      if (!required.has(key)) problems.push(`${path}.${key} is not required`);
      problems.push(...strictModeProblems(schema.properties[key]!, `${path}.${key}`));
    }
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    problems.push(`${path} is an open record`);
  }
  const items = Array.isArray(schema.items) ? schema.items : schema.items ? [schema.items] : [];
  for (const item of items) problems.push(...strictModeProblems(item, `${path}[]`));
  for (const variant of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])]) {
    problems.push(...strictModeProblems(variant, path));
  }
  return problems;
}

function toJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: "input", target: "draft-7" }) as JsonSchema;
}

describe("OpenAI strict-mode compatibility", () => {
  it.each([
    ["BrandContextSchema", BrandContextSchema],
    ["PingSchema", PingSchema],
    ["WorkflowPlanSchema", WorkflowPlanSchema],
  ] as const)("%s has every property required and no records", (_name, schema) => {
    expect(strictModeProblems(toJsonSchema(schema))).toEqual([]);
  });

  it("the checker catches .optional() and records", () => {
    const bad = z.object({ a: z.string().optional(), b: z.record(z.string(), z.string()) });
    const problems = strictModeProblems(toJsonSchema(bad));
    expect(problems).toContain("$.a is not required");
    expect(problems).toContain("$.b is an open record");
  });
});

describe("emptyBrandContext", () => {
  it("produces a valid Brand Context", () => {
    const context = emptyBrandContext({ name: "Test", description: "d", stage: "idea" });
    expect(BrandContextSchema.parse(context)).toEqual(context);
    expect(context.project).toEqual({ name: "Test", description: "d", stage: "idea" });
    expect(context.selected_direction).toBeNull();
  });

  it("defaults to a blank project with no stage", () => {
    expect(emptyBrandContext().project).toEqual({ name: "", description: "", stage: null });
  });
});

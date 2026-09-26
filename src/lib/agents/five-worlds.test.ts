import { describe, expect, it } from "vitest";
import {
  WorldsGenerateOutputSchema,
  WorldMergeOutputSchema,
  WorldReviseOutputSchema,
  type World,
} from "@/lib/schemas/outputs/worlds";
import { normaliseWorld, worldsAreDistinct } from "./five-worlds";
import generateFixture from "../../../scripts/stub/fixtures/worlds_generate.json";
import exploreFixture from "../../../scripts/stub/fixtures/worlds_explore.json";
import mergeFixture from "../../../scripts/stub/fixtures/worlds_merge.json";
import reviseFixture from "../../../scripts/stub/fixtures/worlds_revise.json";

/*
 * Five Worlds (plan §14.5). The stub fixtures double as the realistic mock
 * outputs, so a fixture that drifts from the schema fails here rather than
 * halfway through a demo.
 */

const worlds = generateFixture.outputs[0]!.worlds as World[];

describe("worlds schemas", () => {
  it("validate every shipped fixture", () => {
    expect(WorldsGenerateOutputSchema.parse(generateFixture.outputs[0]).worlds).toHaveLength(3);
    expect(WorldsGenerateOutputSchema.parse(exploreFixture.outputs[0]).worlds).toHaveLength(2);
    expect(WorldMergeOutputSchema.parse(mergeFixture.outputs[0]).world.id).toBe("merged");
    expect(WorldReviseOutputSchema.parse(reviseFixture.outputs[0]).world.id).toBe("w1");
  });

  it("rejects a world with an id outside the set", () => {
    const bad = { worlds: [{ ...worlds[0], id: "w9" }] };
    expect(WorldsGenerateOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe("normaliseWorld", () => {
  it("passes a well-formed world through with no issues", () => {
    const { world, checks } = normaliseWorld(worlds[0]!);

    expect(checks.issues).toEqual([]);
    expect(world.personality).toEqual(worlds[0]!.personality);
    expect(checks.contrast?.level).toBe("AAA");
    expect(checks.font_families).toEqual(["IBM Plex Mono", "Inter"]);
  });

  it("repairs a shorthand hex and flags one that cannot be repaired", () => {
    const { world, checks } = normaliseWorld({
      ...worlds[0]!,
      colors: [
        { name: "Paper", hex: "#fff", role: "background" },
        { name: "Ink", hex: "#111111", role: "text" },
        { name: "Broken", hex: "#12345", role: "accent" },
      ],
    });

    expect(world.colors[0]!.hex).toBe("#FFFFFF");
    expect(world.colors[2]!.hex).toBe("#12345");
    expect(checks.issues).toHaveLength(1);
    expect(checks.issues[0]).toMatchObject({ kind: "invalid_hex", severity: "high" });
  });

  it("flags a palette nobody could read", () => {
    const { checks } = normaliseWorld({
      ...worlds[0]!,
      colors: [
        { name: "Mist", hex: "#BBBBBB", role: "background" },
        { name: "Fog", hex: "#C4C4C4", role: "text" },
      ],
    });

    expect(checks.contrast?.level).toBe("fail");
    expect(checks.issues.some((issue) => issue.kind === "contrast")).toBe(true);
  });

  it("flags a font outside the allowlist but keeps the suggestion", () => {
    const { world, checks } = normaliseWorld({
      ...worlds[0]!,
      typography: [
        { role: "headings", family: "Helvetica Neue", rationale: "clean" },
        { role: "body", family: "Inter", rationale: "legible" },
      ],
    });

    expect(world.typography[0]!.family).toBe("Helvetica Neue");
    expect(checks.issues.some((issue) => issue.kind === "font")).toBe(true);
    expect(checks.font_families).toEqual(["Inter"]);
  });

  it("clamps the lists the schema cannot bound", () => {
    const { world } = normaliseWorld({
      ...worlds[0]!,
      personality: ["One", "one", "Two", "Three", "Four", "Five", "Six"],
      voice_rules: ["A", "B", "C", "D"],
      sample_names: [
        { name: "One", rationale: "a" },
        { name: "Two", rationale: "b" },
        { name: "Three", rationale: "c" },
        { name: "Four", rationale: "d" },
      ],
      risks: ["A", "B", "C", "D"],
      obvious_ideas_rejected: ["A", "B", "C", "D"],
    });

    expect(world.personality).toEqual(["One", "Two", "Three", "Four", "Five"]);
    expect(world.voice_rules).toHaveLength(3);
    expect(world.sample_names).toHaveLength(3);
    expect(world.risks).toHaveLength(3);
    expect(world.obvious_ideas_rejected).toHaveLength(3);
  });

  it("drops a sample name with no name at all", () => {
    const { world } = normaliseWorld({
      ...worlds[0]!,
      sample_names: [
        { name: "  ", rationale: "nothing" },
        { name: "Entry", rationale: "something" },
      ],
    });
    expect(world.sample_names).toEqual([{ name: "Entry", rationale: "something" }]);
  });
});

describe("worldsAreDistinct", () => {
  it("accepts the shipped worlds", () => {
    expect(worldsAreDistinct(worlds)).toBe(true);
  });

  it("notices two worlds with the same personality in a different order", () => {
    const twin: World = { ...worlds[1]!, id: "w3", personality: [...worlds[0]!.personality].reverse() };
    expect(worldsAreDistinct([worlds[0]!, twin])).toBe(false);
  });
});

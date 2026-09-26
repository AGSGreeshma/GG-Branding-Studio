import { describe, expect, it } from "vitest";
import {
  countBySeverity,
  detectAcrossFields,
  detectGeneric,
  detectNamingPatterns,
  hasHighSeverity,
  highestSeverity,
  segmentText,
} from "./detect";

/*
 * The deterministic half of the Anti-Generic Engine (plan §14.6, N12).
 * These tests are the specification: a word list that flags honest writing is
 * worse than no word list at all, so the false-positive cases matter most.
 */

describe("detectGeneric", () => {
  it("flags the plan's own example sentence", () => {
    const hits = detectGeneric("Empowering the future with innovative technology.");
    const matches = hits.map((hit) => hit.match.toLowerCase());

    expect(matches).toContain("empowering the future");
    expect(matches).toContain("innovative");
    expect(hasHighSeverity(hits)).toBe(true);
  });

  it("flags empty superlatives as high severity", () => {
    expect(highestSeverity(detectGeneric("A world-class team."))).toBe("high");
    expect(highestSeverity(detectGeneric("Our industry-leading platform."))).toBe("high");
    expect(highestSeverity(detectGeneric("Simply the best way to file."))).toBe("high");
  });

  it("matches inflections and hyphen or space variants", () => {
    expect(detectGeneric("We empower students")).toHaveLength(1);
    expect(detectGeneric("Empowered by design")).toHaveLength(1);
    expect(detectGeneric("A next-gen tool")).toHaveLength(1);
    expect(detectGeneric("A next gen tool")).toHaveLength(1);
  });

  it("reports each hit once, preferring the longest phrase", () => {
    // "the future of" contains no other entry, but "take your … to the next level" does.
    const hits = detectGeneric("Take your brand to the next level.");
    expect(hits.map((hit) => hit.match.toLowerCase())).toEqual(["take your", "to the next level"]);
  });

  it("leaves plain, specific writing alone", () => {
    const honest =
      "Students see which projects a teammate finished, and who confirmed it, before they agree to work together.";
    expect(detectGeneric(honest)).toEqual([]);
  });

  it("does not fire on words that merely contain a term", () => {
    // "solutions" is a hit, but "resolution" and "dissolve" must not be.
    expect(detectGeneric("The resolution dissolved the empowerment debate.").map((h) => h.match)).toEqual([
      "empowerment",
    ]);
    expect(detectGeneric("We resolve disputes.")).toEqual([]);
  });

  it("returns offsets that point at the matched text", () => {
    const text = "A seamless experience.";
    const [hit] = detectGeneric(text);
    expect(text.slice(hit!.start, hit!.end)).toBe("seamless");
  });

  it("ignores empty input", () => {
    expect(detectGeneric("")).toEqual([]);
    expect(detectGeneric("   ")).toEqual([]);
  });
});

describe("detectNamingPatterns", () => {
  it.each([
    ["Teamr", "dropped-vowel"],
    ["Studyify", "-ify"],
    ["Projectly", "-ly"],
    ["TeamHub", "stock compound"],
    ["FinishAI", "AI suffix"],
    ["getTeammate", "get- prefix"],
  ])("flags %s (%s)", (name) => {
    expect(detectNamingPatterns(name).length).toBeGreaterThan(0);
  });

  it.each(["Finish Rate", "Crew Call", "Nobody Ghosts", "Fair Share", "Kiln", "Almanac"])(
    "leaves the distinctive name %s alone",
    (name) => {
      expect(detectNamingPatterns(name)).toEqual([]);
    },
  );

  it("does not apply prose rules to names", () => {
    // "Unlock" as a word is a buzzword, but naming detection judges shape only.
    expect(detectNamingPatterns("Unlock")).toEqual([]);
  });

  it("treats a technology suffix as the most serious naming problem", () => {
    expect(highestSeverity(detectNamingPatterns("TeammateGPT"))).toBe("high");
  });
});

describe("summaries", () => {
  it("counts hits by severity", () => {
    const hits = detectGeneric("Our world-class, innovative, curated solution.");
    const counts = countBySeverity(hits);
    expect(counts.high).toBeGreaterThanOrEqual(1);
    expect(counts.medium).toBeGreaterThanOrEqual(1);
    expect(counts.low).toBeGreaterThanOrEqual(1);
  });

  it("runs across several fields at once", () => {
    const fields = detectAcrossFields([
      { path: "identity.tagline", text: "Unlock your potential." },
      { path: "positioning.statement", text: "Students confirm who finished the work." },
    ]);
    expect(fields[0]!.hits.length).toBeGreaterThan(0);
    expect(fields[1]!.hits).toEqual([]);
  });
});

describe("segmentText", () => {
  it("splits text into plain and flagged pieces that rebuild the original", () => {
    const text = "A seamless way to empower teams.";
    const segments = segmentText(text, detectGeneric(text));

    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(segments.filter((segment) => segment.hit !== null).map((segment) => segment.text)).toEqual([
      "seamless",
      "empower",
    ]);
  });

  it("returns one plain segment when there is nothing to flag", () => {
    expect(segmentText("Plain and specific.", [])).toEqual([
      { text: "Plain and specific.", hit: null },
    ]);
  });
});

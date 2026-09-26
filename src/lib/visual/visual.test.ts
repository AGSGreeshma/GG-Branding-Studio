import { describe, expect, it } from "vitest";
import type { BrandColor, BrandTypography } from "@/lib/schemas/brand-context";
import {
  checkTypography,
  fallbackFor,
  findFont,
  fontStack,
  googleFontsUrl,
} from "./fonts";
import {
  checkPalette,
  contrastLevel,
  contrastRatio,
  normaliseHex,
  relativeLuminance,
} from "./palette";

/*
 * Deterministic visual checks (plan §14.8, T2, T3). A model can return a
 * broken hex or unreadable text on background; these decide it in code.
 */

const color = (name: string, hex: string, role: string): BrandColor => ({ name, hex, role });

describe("normaliseHex", () => {
  it.each([
    ["#abc", "#AABBCC"],
    ["abc", "#AABBCC"],
    ["#AaBbCc", "#AABBCC"],
    ["  #1a2b3c  ", "#1A2B3C"],
    ["1a2b3c", "#1A2B3C"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normaliseHex(input)).toBe(expected);
  });

  it.each(["#12345", "#GGGGGG", "rgb(0,0,0)", "warm sand", "", "#1a2b3c4d"])(
    "rejects %s",
    (input) => {
      expect(normaliseHex(input)).toBeNull();
    },
  );
});

describe("contrast", () => {
  it("matches the known WCAG extremes", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });

  it("does not depend on the order of the arguments", () => {
    expect(contrastRatio("#1A2B3C", "#F5F5F0")).toBe(contrastRatio("#F5F5F0", "#1A2B3C"));
  });

  it("returns 0 rather than throwing on a broken colour", () => {
    expect(contrastRatio("#12345", "#FFFFFF")).toBe(0);
  });

  it.each([
    [21, "AAA"],
    [7, "AAA"],
    [4.5, "AA"],
    [4.49, "AA Large"],
    [3, "AA Large"],
    [2.99, "fail"],
  ])("grades %s as %s", (ratio, level) => {
    expect(contrastLevel(ratio)).toBe(level);
  });
});

describe("checkPalette", () => {
  it("fixes shorthand and casing without complaining", () => {
    const result = checkPalette([
      color("Ink", "#123", "text"),
      color("Paper", "faf8f3", "background"),
    ]);

    expect(result.colors.map((entry) => entry.hex)).toEqual(["#112233", "#FAF8F3"]);
    expect(result.issues).toEqual([]);
    expect(result.pair?.level).toBe("AAA");
  });

  it("flags an invalid hex as high severity and leaves the value alone", () => {
    const result = checkPalette([color("Broken", "#12345", "accent")]);

    expect(result.issues[0]).toMatchObject({ kind: "invalid_hex", severity: "high" });
    expect(result.colors[0]!.hex).toBe("#12345");
  });

  it("fails a text and background pair that nobody could read", () => {
    const result = checkPalette([
      color("Mist", "#BBBBBB", "text colour"),
      color("Fog", "#CCCCCC", "background"),
    ]);

    expect(result.pair?.level).toBe("fail");
    expect(result.issues[0]).toMatchObject({ kind: "contrast", severity: "high" });
    expect(result.issues[0]!.message).toContain("4.5:1");
  });

  it("marks a heading-only pair as medium rather than failing it", () => {
    // ~3.5:1 — usable for large type, not for body text.
    const result = checkPalette([
      color("Slate", "#767676", "body text"),
      color("Cloud", "#E8E8E8", "surface"),
    ]);

    expect(result.pair?.level).toBe("AA Large");
    expect(result.issues[0]).toMatchObject({ kind: "contrast", severity: "medium" });
  });

  it("recognises roles written in the model's own words", () => {
    const result = checkPalette([
      color("Ink", "#111111", "Primary text / ink"),
      color("Paper", "#FFFFFF", "Page background"),
    ]);
    expect(result.pair).not.toBeNull();
  });

  it("notes, at low severity, a palette with no text and background pair", () => {
    const result = checkPalette([color("Coral", "#FF6B5A", "accent")]);
    expect(result.pair).toBeNull();
    expect(result.issues[0]).toMatchObject({ kind: "no_pair", severity: "low" });
  });

  it("says nothing about an empty palette", () => {
    expect(checkPalette([])).toEqual({ colors: [], issues: [], pair: null });
  });
});

describe("font allowlist", () => {
  const spec = (family: string, role = "headings"): BrandTypography => ({
    role,
    family,
    rationale: "because",
  });

  it("matches families regardless of case and spacing", () => {
    expect(findFont("inter")?.family).toBe("Inter");
    expect(findFont("  Space   Grotesk ")?.family).toBe("Space Grotesk");
  });

  it("accepts an allowlisted pairing with no issues", () => {
    const result = checkTypography([spec("Fraunces"), spec("Inter", "body")]);

    expect(result.issues).toEqual([]);
    expect(result.families.map((font) => font.family)).toEqual(["Fraunces", "Inter"]);
  });

  it("flags a font it cannot render instead of swapping it silently", () => {
    const result = checkTypography([spec("Helvetica Neue")]);

    expect(result.issues[0]).toMatchObject({ severity: "medium", family: "Helvetica Neue" });
    expect(result.entries[0]!.font).toBeNull();
    // The suggestion survives; only the specimen is missing.
    expect(result.entries[0]!.spec.family).toBe("Helvetica Neue");
  });

  it("lists each family once, even when used for two roles", () => {
    const result = checkTypography([spec("Inter", "headings"), spec("Inter", "body")]);
    expect(result.families).toHaveLength(1);
  });

  it("builds a Google Fonts URL with the weights it needs", () => {
    const url = googleFontsUrl([findFont("Inter")!, findFont("Fraunces")!]);
    expect(url).toBe(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Fraunces:wght@400;700&display=swap",
    );
    expect(googleFontsUrl([])).toBeNull();
  });

  it("falls back to a readable stack when a font is not allowed", () => {
    expect(fontStack(findFont("Inter"))).toBe('"Inter", system-ui, sans-serif');
    expect(fontStack(null)).toBe("system-ui, sans-serif");
    expect(fallbackFor("serif").category).toBe("serif");
  });
});

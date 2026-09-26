import type { BrandColor } from "@/lib/schemas/brand-context";

/*
 * Deterministic colour checks (plan §14.8, T3). A model will happily return
 * "#12345" or put grey text on a grey background, so hex validity and WCAG
 * contrast are decided in code, not by the model (CLAUDE.md, AI rule 9).
 *
 * What can be fixed is fixed (shorthand and casing); what cannot be fixed
 * safely is flagged, because silently recolouring someone's brand is worse
 * than telling them the pair fails.
 */

export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;
export const WCAG_AAA_NORMAL = 7;

/** "#abc" and "AABBCC" both become "#AABBCC". Returns null when it isn't a colour. */
export function normaliseHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3 && /^[0-9a-f]{3}$/i.test(raw)
      ? raw
          .split("")
          .map((character) => character + character)
          .join("")
      : raw;
  return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toUpperCase()}` : null;
}

function channelLuminance(channel: number): number {
  const ratio = channel / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. Input must already be a normalised hex. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  );
}

/** WCAG contrast ratio, 1–21. Order of the arguments does not matter. */
export function contrastRatio(foreground: string, background: string): number {
  const first = normaliseHex(foreground);
  const second = normaliseHex(background);
  if (!first || !second) return 0;
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

export type ContrastLevel = "AAA" | "AA" | "AA Large" | "fail";

export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= WCAG_AAA_NORMAL) return "AAA";
  if (ratio >= WCAG_AA_NORMAL) return "AA";
  if (ratio >= WCAG_AA_LARGE) return "AA Large";
  return "fail";
}

/** Role matching is fuzzy because the model names roles in its own words. */
const BACKGROUND_ROLE = /\b(background|base|surface|canvas|paper)\b/i;
const TEXT_ROLE = /\b(text|ink|foreground|body|type)\b/i;

export interface PaletteIssue {
  kind: "invalid_hex" | "contrast" | "no_pair";
  severity: "low" | "medium" | "high";
  message: string;
  /** The colour names involved, for the UI. */
  colors: string[];
}

export interface PaletteCheck {
  /** The palette with every fixable hex normalised. */
  colors: BrandColor[];
  issues: PaletteIssue[];
  /** The text-on-background pair the check used, when it found one. */
  pair: { text: BrandColor; background: BrandColor; ratio: number; level: ContrastLevel } | null;
}

/**
 * Normalises hex values, then checks the text/background pair for WCAG AA.
 * A palette with no obvious pair is noted rather than failed: some worlds
 * describe accents only.
 */
export function checkPalette(colors: readonly BrandColor[]): PaletteCheck {
  const issues: PaletteIssue[] = [];

  const fixed = colors.map((color) => {
    const normalised = normaliseHex(color.hex);
    if (!normalised) {
      issues.push({
        kind: "invalid_hex",
        severity: "high",
        message: `"${color.hex}" is not a valid colour, so this swatch cannot be shown.`,
        colors: [color.name],
      });
      return color;
    }
    return { ...color, hex: normalised };
  });

  const valid = fixed.filter((color) => normaliseHex(color.hex) !== null);
  const background = valid.find((color) => BACKGROUND_ROLE.test(color.role));
  const text = valid.find((color) => TEXT_ROLE.test(color.role));

  if (!background || !text) {
    if (valid.length > 0) {
      issues.push({
        kind: "no_pair",
        severity: "low",
        message: "No text and background pair was named, so contrast could not be checked.",
        colors: [],
      });
    }
    return { colors: fixed, issues, pair: null };
  }

  const ratio = contrastRatio(text.hex, background.hex);
  const level = contrastLevel(ratio);
  if (level === "fail" || level === "AA Large") {
    issues.push({
      kind: "contrast",
      severity: level === "fail" ? "high" : "medium",
      message:
        level === "fail"
          ? `${text.name} on ${background.name} has a contrast ratio of ${ratio}:1 — below the 4.5:1 needed for body text.`
          : `${text.name} on ${background.name} is ${ratio}:1 — large headings only, not body text.`,
      colors: [text.name, background.name],
    });
  }

  return { colors: fixed, issues, pair: { text, background, ratio, level } };
}

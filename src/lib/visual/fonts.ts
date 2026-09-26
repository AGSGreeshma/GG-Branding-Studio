import type { BrandTypography } from "@/lib/schemas/brand-context";

/*
 * Typography allowlist (plan §14.8, T2). Suggestions are limited to freely
 * licensed Google Fonts so the workspace can render a real specimen instead of
 * a font name the user has to imagine. Anything outside the list is flagged
 * with the nearest allowed family rather than silently accepted.
 */

export type FontCategory = "sans" | "serif" | "display" | "mono" | "slab";

export interface AllowedFont {
  family: string;
  category: FontCategory;
  /** CSS fallback used until the web font loads. */
  fallback: string;
  /** Weights requested from Google Fonts for the specimen. */
  weights: number[];
}

export const ALLOWED_FONTS: AllowedFont[] = [
  // Sans
  { family: "Inter", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 600] },
  { family: "Work Sans", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 600] },
  { family: "DM Sans", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Manrope", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Plus Jakarta Sans", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Figtree", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Outfit", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 600] },
  { family: "Space Grotesk", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Archivo", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Public Sans", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Rubik", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 600] },
  { family: "Karla", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Nunito Sans", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Source Sans 3", category: "sans", fallback: "system-ui, sans-serif", weights: [400, 600] },
  // Serif
  { family: "Fraunces", category: "serif", fallback: "Georgia, serif", weights: [400, 700] },
  { family: "Lora", category: "serif", fallback: "Georgia, serif", weights: [400, 600] },
  { family: "Source Serif 4", category: "serif", fallback: "Georgia, serif", weights: [400, 600] },
  { family: "Libre Baskerville", category: "serif", fallback: "Georgia, serif", weights: [400, 700] },
  { family: "Crimson Pro", category: "serif", fallback: "Georgia, serif", weights: [400, 600] },
  { family: "Playfair Display", category: "serif", fallback: "Georgia, serif", weights: [400, 700] },
  { family: "EB Garamond", category: "serif", fallback: "Georgia, serif", weights: [400, 600] },
  { family: "Instrument Serif", category: "serif", fallback: "Georgia, serif", weights: [400] },
  { family: "Newsreader", category: "serif", fallback: "Georgia, serif", weights: [400, 600] },
  // Display
  { family: "Bricolage Grotesque", category: "display", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Unbounded", category: "display", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Syne", category: "display", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Chivo", category: "display", fallback: "system-ui, sans-serif", weights: [400, 700] },
  { family: "Anton", category: "display", fallback: "system-ui, sans-serif", weights: [400] },
  // Slab
  { family: "Roboto Slab", category: "slab", fallback: "Georgia, serif", weights: [400, 700] },
  { family: "Zilla Slab", category: "slab", fallback: "Georgia, serif", weights: [400, 700] },
  // Mono
  { family: "JetBrains Mono", category: "mono", fallback: "ui-monospace, monospace", weights: [400, 700] },
  { family: "IBM Plex Mono", category: "mono", fallback: "ui-monospace, monospace", weights: [400, 600] },
  { family: "Space Mono", category: "mono", fallback: "ui-monospace, monospace", weights: [400, 700] },
];

const BY_NORMALISED = new Map(
  ALLOWED_FONTS.map((font) => [font.family.toLowerCase().replace(/\s+/g, " "), font]),
);

/** The allowlist entry for a family name, ignoring case and extra spaces. */
export function findFont(family: string): AllowedFont | null {
  return BY_NORMALISED.get(family.trim().toLowerCase().replace(/\s+/g, " ")) ?? null;
}

/** A readable default when a suggestion is outside the list. */
export function fallbackFor(category: FontCategory): AllowedFont {
  return ALLOWED_FONTS.find((font) => font.category === category) ?? ALLOWED_FONTS[0]!;
}

export interface FontIssue {
  severity: "low" | "medium" | "high";
  message: string;
  family: string;
}

export interface TypographyCheck {
  /** Each entry paired with its allowlist match, or null when it has none. */
  entries: Array<{ spec: BrandTypography; font: AllowedFont | null }>;
  issues: FontIssue[];
  /** Families to load from Google Fonts for the specimen. */
  families: AllowedFont[];
}

/**
 * Checks typography suggestions against the allowlist. A family we cannot
 * render is flagged, not swapped: the suggestion may still be the right
 * advice, it just cannot be previewed here.
 */
export function checkTypography(typography: readonly BrandTypography[]): TypographyCheck {
  const issues: FontIssue[] = [];
  const entries = typography.map((spec) => {
    const font = findFont(spec.family);
    if (!font) {
      issues.push({
        severity: "medium",
        family: spec.family,
        message: `"${spec.family}" is not in the free-font allowlist, so no specimen can be shown for it.`,
      });
    }
    return { spec, font };
  });

  const families: AllowedFont[] = [];
  for (const entry of entries) {
    if (entry.font && !families.some((font) => font.family === entry.font!.family)) {
      families.push(entry.font);
    }
  }

  return { entries, issues, families };
}

/** The Google Fonts stylesheet URL for a set of families, or null for none. */
export function googleFontsUrl(fonts: readonly AllowedFont[]): string | null {
  if (fonts.length === 0) return null;
  const families = fonts
    .map((font) => {
      const weights = [...new Set(font.weights)].sort((a, b) => a - b).join(";");
      return `family=${font.family.replace(/\s+/g, "+")}:wght@${weights}`;
    })
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/** The CSS font-family value for a spec, falling back when it isn't allowed. */
export function fontStack(font: AllowedFont | null): string {
  return font ? `"${font.family}", ${font.fallback}` : "system-ui, sans-serif";
}

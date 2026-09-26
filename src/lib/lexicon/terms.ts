/*
 * The deterministic half of the Anti-Generic Engine (plan §14.6, N12).
 *
 * Every entry is a judgement call written down: the phrase, why it is weak,
 * and how much it matters. Keeping them here — rather than in a prompt — means
 * the same text always gets the same verdict, the list is reviewable, and the
 * LLM critic can be reserved for nuance it is actually better at (rule 9).
 *
 * Severity:
 *   high    — says nothing at all, or claims something unverifiable. Always revise.
 *   medium  — filler that a sharper word would replace.
 *   low     — fine in moderation; worth noticing when it stacks up.
 */

export const LEXICON_KINDS = [
  "buzzword",
  "empty_claim",
  "startup_phrase",
  "naming_pattern",
] as const;
export type LexiconKind = (typeof LEXICON_KINDS)[number];

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface TermEntry {
  /** The stem as written; matching adds common suffixes and word boundaries. */
  term: string;
  severity: Severity;
  /** Shown to the user next to the highlight. One sentence, specific. */
  note: string;
}

/** Single words that sound like meaning and aren't (plan §14.6). */
export const BUZZWORDS: TermEntry[] = [
  { term: "revolutionize", severity: "high", note: "Claims an industry-wide change nothing here demonstrates." },
  { term: "revolutionary", severity: "high", note: "Claims an industry-wide change nothing here demonstrates." },
  { term: "game-changing", severity: "high", note: "Says the product matters without saying what it does." },
  { term: "game changer", severity: "high", note: "Says the product matters without saying what it does." },
  { term: "cutting-edge", severity: "high", note: "A claim about novelty that every competitor also makes." },
  { term: "next-generation", severity: "high", note: "Newer than what, and better how?" },
  { term: "next-gen", severity: "high", note: "Newer than what, and better how?" },
  { term: "empower", severity: "high", note: "Empower whom to do what? The sentence works harder without it." },
  { term: "disrupt", severity: "high", note: "Describes an ambition, not an offer." },
  { term: "synergy", severity: "high", note: "Consultancy filler with no concrete meaning." },
  { term: "innovative", severity: "medium", note: "Every product claims this; show the innovation instead." },
  { term: "seamless", severity: "medium", note: "Describes an absence of friction rather than a benefit." },
  { term: "effortless", severity: "medium", note: "Describes an absence of friction rather than a benefit." },
  { term: "frictionless", severity: "medium", note: "Describes an absence of friction rather than a benefit." },
  { term: "unlock", severity: "medium", note: "A metaphor standing in for the actual outcome." },
  { term: "leverage", severity: "medium", note: "Corporate substitute for \"use\"." },
  { term: "elevate", severity: "medium", note: "Vague upward motion; name the change instead." },
  { term: "streamline", severity: "medium", note: "Says a process got shorter without saying which." },
  { term: "supercharge", severity: "medium", note: "Energy metaphor in place of a measurable claim." },
  { term: "transformative", severity: "medium", note: "Transformation is the claim readers most discount." },
  { term: "robust", severity: "medium", note: "Engineering filler; say what it withstands." },
  { term: "cutting edge", severity: "medium", note: "A claim about novelty that every competitor also makes." },
  { term: "holistic", severity: "medium", note: "Usually means \"we could not decide what to focus on\"." },
  { term: "bespoke", severity: "low", note: "Fine occasionally; often just means \"custom\"." },
  { term: "curated", severity: "low", note: "Overused for anything with a list in it." },
  { term: "ecosystem", severity: "low", note: "Borrowed biology; rarely adds meaning to a product." },
  { term: "solution", severity: "low", note: "The vaguest available noun for a product." },
  { term: "journey", severity: "low", note: "Fine for a real sequence; filler for anything else." },
];

/** Claims with nothing behind them. These are the ones worth always fixing. */
export const EMPTY_CLAIMS: TermEntry[] = [
  { term: "world-class", severity: "high", note: "An unverifiable superlative." },
  { term: "world class", severity: "high", note: "An unverifiable superlative." },
  { term: "best-in-class", severity: "high", note: "An unverifiable superlative." },
  { term: "industry-leading", severity: "high", note: "Leading by what measure, published where?" },
  { term: "industry leading", severity: "high", note: "Leading by what measure, published where?" },
  { term: "the best", severity: "high", note: "Unprovable, and every competitor says it." },
  { term: "market-leading", severity: "high", note: "Leading by what measure, published where?" },
  { term: "state-of-the-art", severity: "high", note: "An unverifiable superlative." },
  { term: "unparalleled", severity: "high", note: "An unverifiable superlative." },
  { term: "unmatched", severity: "high", note: "An unverifiable superlative." },
  { term: "premium quality", severity: "high", note: "Quality claimed rather than shown." },
  { term: "trusted by thousands", severity: "high", note: "A number without a source." },
  { term: "second to none", severity: "high", note: "An unverifiable superlative." },
];

/** Multi-word phrases that mark copy as generic on sight. */
export const STARTUP_PHRASES: TermEntry[] = [
  { term: "the future of", severity: "high", note: "The most common opening in startup copy." },
  { term: "one-stop shop", severity: "high", note: "Breadth claimed as a virtue; says nothing specific." },
  { term: "one stop shop", severity: "high", note: "Breadth claimed as a virtue; says nothing specific." },
  { term: "all-in-one platform", severity: "high", note: "Breadth claimed as a virtue; says nothing specific." },
  { term: "take your", severity: "low", note: "Usually the start of \"take your X to the next level\"." },
  { term: "to the next level", severity: "high", note: "The definitive filler phrase for progress." },
  { term: "empowering the future", severity: "high", note: "Two clichés in three words." },
  { term: "we believe that", severity: "medium", note: "Manifesto opener that delays the point." },
  { term: "reimagining", severity: "medium", note: "Popular verb for changing very little." },
  { term: "reinventing", severity: "medium", note: "Popular verb for changing very little." },
  { term: "connecting people", severity: "medium", note: "True of almost every product ever built." },
  { term: "making it easy", severity: "medium", note: "Easy compared with what?" },
  { term: "designed for you", severity: "medium", note: "Personalisation claimed with no specifics." },
  { term: "built different", severity: "medium", note: "Difference asserted rather than shown." },
  { term: "at scale", severity: "low", note: "Frequently added to sound serious." },
  { term: "on a mission to", severity: "medium", note: "Mission language in place of an offer." },
  { term: "smarter way", severity: "medium", note: "Smarter than what, measured how?" },
  { term: "power your", severity: "medium", note: "Energy metaphor in place of an outcome." },
];

export interface NamingPattern {
  name: string;
  /** Applied to a whole candidate name, not to prose. */
  test: RegExp;
  severity: Severity;
  note: string;
}

/** Overused naming shapes (plan §14.6, N5). Applied to candidate names only. */
export const NAMING_PATTERNS: NamingPattern[] = [
  {
    name: "dropped-vowel-r",
    test: /^[a-z]{3,}[bcdfghjklmnpqrstvwxz]r$/i,
    severity: "medium",
    note: "The dropped-vowel \"-r\" name (Flickr, Tumblr) dates the brand to 2008.",
  },
  {
    name: "ify-suffix",
    test: /^[a-z]{3,}(ify|efy)$/i,
    severity: "medium",
    note: "The \"-ify\" suffix is one of the most crowded naming shapes there is.",
  },
  {
    name: "ly-suffix",
    test: /^[a-z]{4,}ly$/i,
    severity: "medium",
    note: "The \"-ly\" suffix reads as a 2014 SaaS product.",
  },
  {
    name: "stock-compound",
    test: /^[A-Z][a-z]{2,}(Hub|Base|Flow|Sync|Verse|Wise|Mate|Buddy|Spot|Nest|Loop|Stack|Forge|Craft|Labs|Works|Kit|Box|Desk|Grid|Path|Peak|Pulse|Sphere|Wave|Link|Bridge|Genius|Ninja|Pro)$/,
    severity: "medium",
    note: "Two stock words joined together; the second half could belong to any product.",
  },
  {
    name: "ai-suffix",
    test: /^[A-Za-z]{2,}[.\s-]?(AI|GPT)$/i,
    severity: "high",
    note: "Naming the technology dates the brand and says nothing about the offer.",
  },
  {
    name: "get-prefix",
    test: /^(get|try|use|my|the)[A-Z][a-z]+$/,
    severity: "low",
    note: "A domain-availability workaround rather than a name.",
  },
];

import type { EntryStage } from "@/lib/schemas/workflow";

/** Landing-page copy for the four entry stages (plan §5, §8). Client-safe. */
export interface StageOption {
  id: EntryStage;
  label: string;
  title: string;
  description: string;
  /** Capabilities this stage usually starts with. The orchestrator makes the real plan. */
  likely: string[];
}

export const STAGE_OPTIONS: StageOption[] = [
  {
    id: "idea",
    label: "Stage A",
    title: "I have an idea",
    description: "Build a brand from the ground up.",
    likely: ["Interviewer", "Brand Battle", "Five Worlds"],
  },
  {
    id: "product",
    label: "Stage B",
    title: "I have a product",
    description: "Find your positioning and identity.",
    likely: ["Brand Doctor", "Audience Shifter", "Brand Battle"],
  },
  {
    id: "brand",
    label: "Stage C",
    title: "I have a brand",
    description: "Improve and strengthen what already exists.",
    likely: ["Brand Doctor", "Anti-Generic", "Brand Builder"],
  },
  {
    id: "protect",
    label: "Stage D",
    title: "I want to protect my brand",
    description: "Keep future content consistent.",
    likely: ["Consistency Guardian", "Anti-Generic"],
  },
];

export const HOW_IT_WORKS = [
  "Tell us where you are",
  "AI understands your situation",
  "AI builds your workflow",
  "Explore and challenge ideas",
  "Choose what feels right",
  "Get your Brand System",
  "Launch and keep your brand consistent",
] as const;

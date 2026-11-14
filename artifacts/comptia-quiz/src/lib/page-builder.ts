import { COMPTIA_PASS_RAW_PCT } from "./scoring";

export type TierNumber = 1 | 2 | 3;

export interface EditableTierSettings {
  name: string;
  description: string;
  questionCount: number;
  secondsPerQuestion: number;
  passingScore: number;
  color: string;
}

export interface PageBuilderSettings {
  eyebrow: string;
  title: string;
  subtitle: string;
  tagline: string;
  disclaimerTitle: string;
  disclaimerText: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  panelColor: string;
  textColor: string;
  tiers: Record<"1" | "2" | "3", EditableTierSettings>;
}

export const DEFAULT_PAGE_BUILDER_SETTINGS: PageBuilderSettings = {
  eyebrow: "CompTIA Certification Prep",
  title: "Trifecta Quiz",
  subtitle: "A+, Network+, and Security+ practice questions",
  tagline: "Build confidence by mastering what you know with certainty",
  disclaimerTitle: "Practice Disclaimer",
  disclaimerText:
    "This is a practice tool for CompTIA exam prep. The 100–900 scoring scale and 750 passing score are simulations based on CompTIA's real scoring model, but your actual exam results may differ. Questions are curated from the full question bank and are timed to mimic exam pressure.",
  primaryColor: "#dc2626",
  accentColor: "#06b6d4",
  backgroundColor: "#070b14",
  panelColor: "#111827",
  textColor: "#f3f4f6",
  tiers: {
    "1": {
      name: "Mild",
      description: "Foundational troubleshooting",
      questionCount: 270,
      secondsPerQuestion: 75,
      passingScore: COMPTIA_PASS_RAW_PCT,
      color: "#22c55e",
    },
    "2": {
      name: "Medium",
      description: "Applied exam scenarios",
      questionCount: 270,
      secondsPerQuestion: 60,
      passingScore: COMPTIA_PASS_RAW_PCT,
      color: "#f59e0b",
    },
    "3": {
      name: "HellMode",
      description: "Forensic logs and advanced troubleshooting",
      questionCount: 270,
      secondsPerQuestion: 45,
      passingScore: COMPTIA_PASS_RAW_PCT,
      color: "#ef4444",
    },
  },
};

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

function boundedText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) || fallback : fallback;
}

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

export function normalizePageBuilderSettings(value: unknown): PageBuilderSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const inputTiers = input.tiers && typeof input.tiers === "object"
    ? input.tiers as Record<string, unknown>
    : {};

  const tiers = {} as PageBuilderSettings["tiers"];
  for (const tier of [1, 2, 3] as const) {
    const key = String(tier) as keyof typeof tiers;
    const incoming = inputTiers[key] && typeof inputTiers[key] === "object"
      ? inputTiers[key] as Record<string, unknown>
      : {};
    const fallback = DEFAULT_PAGE_BUILDER_SETTINGS.tiers[key];
    tiers[key] = {
      name: boundedText(incoming.name, fallback.name, 32),
      description: boundedText(incoming.description, fallback.description, 80),
      questionCount: boundedInteger(incoming.questionCount, fallback.questionCount, 1, 270),
      secondsPerQuestion: tier === 3
        ? 45
        : boundedInteger(incoming.secondsPerQuestion, fallback.secondsPerQuestion, 15, 180),
      passingScore: boundedInteger(incoming.passingScore, fallback.passingScore, 50, 100),
      color: safeColor(incoming.color, fallback.color),
    };
  }

  const text = (key: keyof PageBuilderSettings, limit: number) =>
    boundedText(input[key], DEFAULT_PAGE_BUILDER_SETTINGS[key] as string, limit);

  return {
    eyebrow: text("eyebrow", 48),
    title: text("title", 60),
    subtitle: text("subtitle", 100),
    tagline: text("tagline", 120),
    disclaimerTitle: text("disclaimerTitle", 48),
    disclaimerText: text("disclaimerText", 700),
    primaryColor: safeColor(input.primaryColor, DEFAULT_PAGE_BUILDER_SETTINGS.primaryColor),
    accentColor: safeColor(input.accentColor, DEFAULT_PAGE_BUILDER_SETTINGS.accentColor),
    backgroundColor: safeColor(input.backgroundColor, DEFAULT_PAGE_BUILDER_SETTINGS.backgroundColor),
    panelColor: safeColor(input.panelColor, DEFAULT_PAGE_BUILDER_SETTINGS.panelColor),
    textColor: safeColor(input.textColor, DEFAULT_PAGE_BUILDER_SETTINGS.textColor),
    tiers,
  };
}

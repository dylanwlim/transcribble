export type HardwareTier = "light" | "balanced" | "strong";

export interface HardwareProfile {
  tier: HardwareTier;
  cores: number | null;
  memoryGb: number | null;
  recommendedWorkers: number;
  recommendedModelProfile: "fast" | "accurate";
  summary: string;
}

interface NavigatorWithHardware extends Navigator {
  deviceMemory?: number;
}

export function detectHardwareProfile(): HardwareProfile {
  if (typeof navigator === "undefined") {
    return {
      tier: "balanced",
      cores: null,
      memoryGb: null,
      recommendedWorkers: 2,
      recommendedModelProfile: "fast",
      summary: "Hardware details unavailable. Using balanced defaults.",
    };
  }

  const nav = navigator as NavigatorWithHardware;
  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null;
  const memoryGb = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;

  let tier: HardwareTier = "balanced";
  if ((cores !== null && cores >= 8) && (memoryGb === null || memoryGb >= 16)) {
    tier = "strong";
  } else if ((cores !== null && cores <= 4) || (memoryGb !== null && memoryGb <= 4)) {
    tier = "light";
  }

  const recommendedWorkers = tier === "strong" ? 4 : tier === "balanced" ? 2 : 1;
  const recommendedModelProfile = tier === "strong" ? "accurate" : "fast";

  const coresLabel = cores !== null ? `${cores} cores` : "unknown cores";
  const memoryLabel = memoryGb !== null ? `${memoryGb} GB RAM` : "unknown RAM";
  const summary = `${coresLabel} · ${memoryLabel}`;

  return {
    tier,
    cores,
    memoryGb,
    recommendedWorkers,
    recommendedModelProfile,
    summary,
  };
}

export function describeHardwareTier(tier: HardwareTier): string {
  switch (tier) {
    case "strong":
      return "Strong — accuracy mode and up to 4 parallel chunks run comfortably.";
    case "light":
      return "Light — fast mode and a single chunk worker keeps things responsive.";
    case "balanced":
    default:
      return "Balanced — fast mode with a couple of parallel chunks works well.";
  }
}

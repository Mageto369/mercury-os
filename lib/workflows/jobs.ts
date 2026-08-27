export type IntelligenceJobName =
  | "market-regime"
  | "gem-discovery"
  | "liquidity-pulse"
  | "social-radar"
  | "sec-filings"
  | "finra-actions"
  | "share-structure"
  | "risk-gateway"
  | "model-learning";

export interface IntelligenceJobDefinition {
  name: IntelligenceJobName;
  cadence: string;
  priority: "critical" | "high" | "normal";
  shadowOnly: boolean;
  description: string;
}

export const intelligenceJobs: IntelligenceJobDefinition[] = [
  { name: "liquidity-pulse", cadence: "1m", priority: "critical", shadowOnly: true, description: "Spread, RVOL, trade velocity, float rotation and liquidity deterioration." },
  { name: "social-radar", cadence: "2m", priority: "high", shadowOnly: true, description: "Authorized Reddit, Discord, Telegram and Facebook attention velocity and promotion forensics." },
  { name: "sec-filings", cadence: "5m", priority: "critical", shadowOnly: true, description: "8-K, S-1, S-3, 424B, Form 4, financing and catalyst extraction." },
  { name: "gem-discovery", cadence: "15m", priority: "high", shadowOnly: true, description: "Quiet accumulation, clean structure, catalyst timing and attention-gap discovery." },
  { name: "market-regime", cadence: "5m", priority: "high", shadowOnly: true, description: "Small-cap breadth, volatility, sector rotation, speculative appetite and funding conditions." },
  { name: "share-structure", cadence: "15m", priority: "critical", shadowOnly: true, description: "Outstanding shares, float, authorized shares and dilution change detection." },
  { name: "finra-actions", cadence: "30m", priority: "critical", shadowOnly: true, description: "Reverse splits, symbol changes and other corporate actions." },
  { name: "risk-gateway", cadence: "1m", priority: "critical", shadowOnly: true, description: "Independent hard blocks for structural, liquidity, peak and manipulation risk." },
  { name: "model-learning", cadence: "daily", priority: "normal", shadowOnly: true, description: "Replay, false-positive analysis, missed runners, exit efficiency and model drift." },
];

export function jobsForCronPulse() {
  return intelligenceJobs.filter((job) => job.cadence !== "daily");
}

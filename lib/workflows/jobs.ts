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
  cadenceMinutes: number;
  priority: "critical" | "high" | "normal";
  shadowOnly: boolean;
  description: string;
}

export const intelligenceJobs: IntelligenceJobDefinition[] = [
  { name: "liquidity-pulse", cadenceMinutes: 1, priority: "critical", shadowOnly: true, description: "Spread, RVOL, trade velocity, float rotation and liquidity deterioration." },
  { name: "risk-gateway", cadenceMinutes: 1, priority: "critical", shadowOnly: true, description: "Independent hard blocks for structural, liquidity, peak and manipulation risk." },
  { name: "social-radar", cadenceMinutes: 2, priority: "high", shadowOnly: true, description: "Authorized Reddit, Discord, Telegram and Facebook attention velocity and promotion forensics." },
  { name: "sec-filings", cadenceMinutes: 5, priority: "critical", shadowOnly: true, description: "8-K, S-1, S-3, 424B, Form 4, financing and catalyst extraction." },
  { name: "market-regime", cadenceMinutes: 5, priority: "high", shadowOnly: true, description: "Small-cap breadth, volatility, sector rotation, speculative appetite and funding conditions." },
  { name: "gem-discovery", cadenceMinutes: 15, priority: "high", shadowOnly: true, description: "Quiet accumulation, clean structure, catalyst timing and attention-gap discovery." },
  { name: "share-structure", cadenceMinutes: 15, priority: "critical", shadowOnly: true, description: "Outstanding shares, float, authorized shares and dilution change detection." },
  { name: "finra-actions", cadenceMinutes: 30, priority: "critical", shadowOnly: true, description: "Reverse splits, symbol changes and other corporate actions." },
  { name: "model-learning", cadenceMinutes: 1440, priority: "normal", shadowOnly: true, description: "Replay, false-positive analysis, missed runners, exit efficiency and model drift." },
];

export function jobsDueAt(date = new Date()) {
  const minutesSinceUtcMidnight = date.getUTCHours() * 60 + date.getUTCMinutes();
  return intelligenceJobs.filter((job) => minutesSinceUtcMidnight % job.cadenceMinutes === 0);
}

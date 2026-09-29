import type { RiseRoom } from "./nasdaq-history";

type FilingSignalType = "dilution" | "catalyst" | "insider" | "governance" | "financials" | "other";

function classifyForm(form: string): { type: FilingSignalType; label: string } {
  const normalized = form.toUpperCase().trim();
  if (normalized === "S-1" || normalized === "S-3" || normalized.startsWith("424B")) {
    return { type: "dilution", label: "financing or resale registration risk" };
  }
  if (normalized === "8-K") return { type: "catalyst", label: "material corporate event" };
  if (normalized === "4") return { type: "insider", label: "insider transaction" };
  if (normalized === "DEF 14A") return { type: "governance", label: "governance or shareholder vote event" };
  if (normalized === "10-Q" || normalized === "10-K") return { type: "financials", label: "financial disclosure" };
  return { type: "other", label: "unclassified filing event" };
}

export interface FilingObservation {
  form: string;
  filedOn: string;
}

export interface SocialObservation {
  mentions: number;
  bullish: number;
  bearish: number;
  watchers: number;
}

export interface PricePush {
  newsLabel: string | null;
  newsForm: string | null;
  blocksRoom: boolean;
  socialHype: number | null;
  socialUnavailable: boolean;
  adjustment: number | null;
}

export const EMPTY_PRICE_PUSH: PricePush = {
  newsLabel: null,
  newsForm: null,
  blocksRoom: false,
  socialHype: null,
  socialUnavailable: false,
  adjustment: null,
};

const NEWS_WINDOW_DAYS = 14;
const HYPE_BOOST_FLOOR = 70;

const NEWS_IMPACT: Record<FilingSignalType, number> = {
  dilution: -40,
  catalyst: 24,
  financials: 8,
  insider: 4,
  governance: 2,
  other: 0,
};

function daySpan(asOf: string, filedOn: string) {
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${filedOn}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return (end - start) / 86_400_000;
}

function recentFilings(filings: FilingObservation[], asOf: string) {
  return filings.filter((filing) => {
    const age = daySpan(asOf, filing.filedOn);
    return age != null && age >= 0 && age <= NEWS_WINDOW_DAYS;
  });
}

export function socialHypeScore(social: SocialObservation | null) {
  if (!social) return null;
  const watchers = Math.max(0, social.watchers);
  const attention = Math.min(100, (Math.log10(Math.max(watchers, 1)) / Math.log10(100_000)) * 100);
  const tagged = social.bullish + social.bearish;
  if (tagged <= 0) return Math.round(attention);
  const bullishShare = social.bullish / tagged;
  return Math.round(Math.min(100, attention * 0.6 + bullishShare * 40));
}

export function scorePricePush(filings: FilingObservation[], social: SocialObservation | null, asOf: string): PricePush {
  const recent = recentFilings(filings, asOf);
  const classified = recent.map((filing) => ({ filing, classification: classifyForm(filing.form) }));
  const dilution = classified.find((item) => item.classification.type === "dilution");
    const lead = dilution ?? classified.slice().sort((left, right) => NEWS_IMPACT[right.classification.type] - NEWS_IMPACT[left.classification.type])[0] ?? null;
  const socialHype = socialHypeScore(social);
  let adjustment = 0;
  let used = false;
  if (lead && lead.classification.type !== "other") {
    adjustment += NEWS_IMPACT[lead.classification.type] * 0.5;
    used = true;
  }
  if (socialHype != null && socialHype >= HYPE_BOOST_FLOOR) {
    adjustment += (socialHype - 60) * 0.4;
    used = true;
  }
  return {
    newsLabel: lead ? lead.classification.label : null,
    newsForm: lead ? lead.filing.form : null,
    blocksRoom: Boolean(dilution),
    socialHype,
    socialUnavailable: false,
    adjustment: used ? Number(adjustment.toFixed(2)) : null,
  };
}

/** A Stocktwits miss stays blank. A stored model score is only a fallback when the feed has not been read. */
export function displaySocialScore(push: PricePush, stored: number | null | undefined): number | null {
  if (push.socialHype != null) return push.socialHype;
  if (push.socialUnavailable) return null;
  return stored != null && stored > 0 ? stored : null;
}

export function observedCatalystScore(push: PricePush): number | null {
  if (!push.newsForm || push.blocksRoom) return null;
  const form = push.newsForm.toUpperCase();
  if (form === "8-K") return 70;
  if (form === "10-Q" || form === "10-K") return 45;
  if (form === "4") return 30;
  if (form === "DEF 14A") return 20;
  return null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** News and elevated social hype move the rise score. A missing feed does not. Dilution removes room. */
export function applyPricePush(rise: RiseRoom, push: PricePush): RiseRoom {
  const room = rise.room && !push.blocksRoom;
  if (rise.score == null || push.adjustment == null) return { score: rise.score, room };
  return { score: clampScore(rise.score + push.adjustment), room };
}

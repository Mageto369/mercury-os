import { desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { securities, socialMentions } from '@/lib/db/schema';

interface SocialPayload {
  mentions?: number;
  velocity?: number;
  crowding?: number;
}

export interface SocialTrend {
  symbol: string;
  mentions: number;
  velocity: number;
  sentiment: number;
  promotionRisk: number;
  crowding: number;
  sources: string[];
  crossSourceConfirmation: number;
}

export interface SocialRadarResult {
  signalsChecked: number;
  trends: SocialTrend[];
}

export async function runSocialRadarWorkflow(): Promise<SocialRadarResult> {
  const db = getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const lookbackMinutes = Math.max(5, Math.min(360, Number(process.env.SOCIAL_LOOKBACK_MINUTES ?? 90)));
  const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000);

  const rows = await db
    .select({
      symbol: securities.symbol,
      source: socialMentions.source,
      sentiment: socialMentions.sentiment,
      promotionRisk: socialMentions.promotionRisk,
      engagement: socialMentions.engagement,
      payload: socialMentions.payload,
      observedAt: socialMentions.observedAt,
    })
    .from(socialMentions)
    .innerJoin(securities, eq(socialMentions.securityId, securities.id))
    .where(gte(socialMentions.observedAt, cutoff))
    .orderBy(desc(socialMentions.observedAt))
    .limit(2000);

  const grouped = new Map<string, {
    mentions: number;
    velocityMax: number;
    sentimentTotal: number;
    promotionTotal: number;
    crowdingMax: number;
    count: number;
    sources: Set<string>;
  }>();

  for (const row of rows) {
    const payload = (row.payload ?? {}) as SocialPayload;
    const current = grouped.get(row.symbol) ?? {
      mentions: 0,
      velocityMax: 0,
      sentimentTotal: 0,
      promotionTotal: 0,
      crowdingMax: 0,
      count: 0,
      sources: new Set<string>(),
    };

    current.mentions += payload.mentions ?? row.engagement ?? 0;
    current.velocityMax = Math.max(current.velocityMax, payload.velocity ?? 0);
    current.sentimentTotal += row.sentiment ?? 0;
    current.promotionTotal += row.promotionRisk ?? 0;
    current.crowdingMax = Math.max(current.crowdingMax, payload.crowding ?? 0);
    current.count += 1;
    current.sources.add(row.source);
    grouped.set(row.symbol, current);
  }

  const trends = [...grouped.entries()].map(([symbol, value]) => ({
    symbol,
    mentions: value.mentions,
    velocity: Math.round(value.velocityMax),
    sentiment: value.count ? Math.round(value.sentimentTotal / value.count) : 0,
    promotionRisk: value.count ? Math.round(value.promotionTotal / value.count) : 0,
    crowding: Math.round(value.crowdingMax),
    sources: [...value.sources].sort(),
    crossSourceConfirmation: Math.min(100, value.sources.size * 25),
  })).sort((a, b) => {
    const scoreA = a.velocity * 0.55 + Math.min(100, a.mentions) * 0.2 + a.crossSourceConfirmation * 0.25 - a.promotionRisk * 0.25;
    const scoreB = b.velocity * 0.55 + Math.min(100, b.mentions) * 0.2 + b.crossSourceConfirmation * 0.25 - b.promotionRisk * 0.25;
    return scoreB - scoreA;
  }).slice(0, 50);

  return { signalsChecked: rows.length, trends };
}

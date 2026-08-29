import { randomUUID } from 'node:crypto';
import { isNotNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { routeOperationalAlert } from '@/lib/alerts/router';
import { filings, securities, systemEvents } from '@/lib/db/schema';
import { classifyFilingForm } from '@/lib/intelligence/filing-classifier';
import { fetchSecRecentFilings } from '@/lib/providers/sec';

const materialForms = new Set(['8-K', '10-Q', '10-K', 'S-1', 'S-3', '424B3', '424B5', 'DEF 14A', '4']);

export interface SecWorkflowResult {
  companiesChecked: number;
  filingsObserved: number;
  filingsInserted: number;
  signalsCreated: number;
  errors: string[];
}

export async function runSecFilingsWorkflow(): Promise<SecWorkflowResult> {
  const db = getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const maxCompanies = Math.max(1, Math.min(100, Number(process.env.SEC_MAX_COMPANIES ?? 25)));
  const tracked = await db
    .select({ id: securities.id, cik: securities.cik, symbol: securities.symbol })
    .from(securities)
    .where(isNotNull(securities.cik))
    .limit(maxCompanies);

  let filingsObserved = 0;
  let filingsInserted = 0;
  let signalsCreated = 0;
  const errors: string[] = [];

  for (const security of tracked) {
    if (!security.cik) continue;
    try {
      const events = await fetchSecRecentFilings(security.cik, materialForms);
      filingsObserved += events.length;

      for (const event of events) {
        const classification = classifyFilingForm(event.form);
        const result = await db
          .insert(filings)
          .values({
            id: randomUUID(),
            securityId: security.id,
            accessionNumber: event.accessionNumber,
            form: event.form,
            filedAt: new Date(`${event.filedAt}T00:00:00Z`),
            url: event.url,
            parsed: {
              cik: event.cik,
              source: 'sec-edgar-submissions',
              classification,
            },
          })
          .onConflictDoNothing({ target: filings.accessionNumber })
          .returning({ id: filings.id });

        if (result.length) {
          filingsInserted += 1;
          const eventResult = await db.insert(systemEvents).values({
            id: randomUUID(),
            eventKey: `sec:${event.accessionNumber}`,
            securityId: security.id,
            category: `filing:${classification.type}`,
            severity: classification.priority,
            source: 'sec-edgar',
            message: `${security.symbol} filed ${event.form}: ${classification.label}`,
            payload: {
              symbol: security.symbol,
              accessionNumber: event.accessionNumber,
              form: event.form,
              filedAt: event.filedAt,
              url: event.url,
              riskDelta: classification.riskDelta,
              catalystDelta: classification.catalystDelta,
            },
          }).onConflictDoNothing({ target: systemEvents.eventKey }).returning({ id: systemEvents.id });
          signalsCreated += eventResult.length;
          if (eventResult.length && classification.priority !== 'normal') {
            await routeOperationalAlert({
              eventKey: `sec:${event.accessionNumber}`,
              category: 'filing',
              severity: classification.priority,
              title: `${security.symbol} material SEC filing`,
              message: `${security.symbol} filed ${event.form}: ${classification.label}`,
              payload: {
                symbol: security.symbol,
                accessionNumber: event.accessionNumber,
                form: event.form,
                riskDelta: classification.riskDelta,
                catalystDelta: classification.catalystDelta,
              },
            });
          }
        }
      }
    } catch (error) {
      errors.push(`${security.cik}: ${error instanceof Error ? error.message : 'unknown SEC error'}`);
    }
  }

  return {
    companiesChecked: tracked.length,
    filingsObserved,
    filingsInserted,
    signalsCreated,
    errors,
  };
}

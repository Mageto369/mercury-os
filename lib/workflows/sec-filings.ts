import { randomUUID } from 'node:crypto';
import { eq, isNotNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { filings, securities } from '@/lib/db/schema';
import { fetchSecRecentFilings } from '@/lib/providers/sec';

const materialForms = new Set(['8-K', '10-Q', '10-K', 'S-1', 'S-3', '424B3', '424B5', 'DEF 14A', '4']);

export interface SecWorkflowResult {
  companiesChecked: number;
  filingsObserved: number;
  filingsInserted: number;
  errors: string[];
}

export async function runSecFilingsWorkflow(): Promise<SecWorkflowResult> {
  const db = getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const maxCompanies = Math.max(1, Math.min(100, Number(process.env.SEC_MAX_COMPANIES ?? 25)));
  const tracked = await db
    .select({ id: securities.id, cik: securities.cik })
    .from(securities)
    .where(isNotNull(securities.cik))
    .limit(maxCompanies);

  let filingsObserved = 0;
  let filingsInserted = 0;
  const errors: string[] = [];

  for (const security of tracked) {
    if (!security.cik) continue;
    try {
      const events = await fetchSecRecentFilings(security.cik, materialForms);
      filingsObserved += events.length;

      for (const event of events) {
        const result = await db
          .insert(filings)
          .values({
            id: randomUUID(),
            securityId: security.id,
            accessionNumber: event.accessionNumber,
            form: event.form,
            filedAt: new Date(`${event.filedAt}T00:00:00Z`),
            url: event.url,
            parsed: { cik: event.cik, source: 'sec-edgar-submissions' },
          })
          .onConflictDoNothing({ target: filings.accessionNumber })
          .returning({ id: filings.id });
        filingsInserted += result.length;
      }
    } catch (error) {
      errors.push(`${security.cik}: ${error instanceof Error ? error.message : 'unknown SEC error'}`);
    }
  }

  return {
    companiesChecked: tracked.length,
    filingsObserved,
    filingsInserted,
    errors,
  };
}

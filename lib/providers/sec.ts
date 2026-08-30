import type { FilingEvent } from '@/lib/providers/contracts';
import { getSecUserAgent } from '@/lib/providers/sec-identity';

interface SecSubmissionsResponse {
  cik: string;
  tickers?: string[];
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      form?: string[];
      primaryDocument?: string[];
    };
  };
}

function normalizeCik(cik: string) {
  return cik.replace(/\D/g, '').padStart(10, '0').slice(-10);
}

export async function fetchSecRecentFilings(cik: string, forms?: Set<string>): Promise<FilingEvent[]> {
  const userAgent = getSecUserAgent();

  const normalizedCik = normalizeCik(cik);
  const response = await fetch(`https://data.sec.gov/submissions/CIK${normalizedCik}.json`, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`SEC submissions request failed with status ${response.status}`);
  }

  const data = await response.json() as SecSubmissionsResponse;
  const recent = data.filings?.recent;
  if (!recent?.accessionNumber?.length) return [];

  const cikPath = String(Number(normalizedCik));
  const events: FilingEvent[] = [];

  for (let index = 0; index < recent.accessionNumber.length; index += 1) {
    const accessionNumber = recent.accessionNumber[index];
    const form = recent.form?.[index];
    const filedAt = recent.filingDate?.[index];
    const primaryDocument = recent.primaryDocument?.[index];
    if (!accessionNumber || !form || !filedAt || !primaryDocument) continue;
    if (forms && !forms.has(form)) continue;

    const accessionPath = accessionNumber.replaceAll('-', '');
    events.push({
      cik: normalizedCik,
      accessionNumber,
      form,
      filedAt,
      url: `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}/${primaryDocument}`,
    });
  }

  return events;
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runSupervisor } from '@/lib/agents/supervisor';
import { requireBearerSecret } from '@/lib/security/request-auth';

export const runtime = 'nodejs';

const jobName = z.enum([
  'market-regime',
  'gem-discovery',
  'liquidity-pulse',
  'social-radar',
  'sec-filings',
  'finra-actions',
  'share-structure',
  'risk-gateway',
  'model-learning',
]);

const requestSchema = z.object({
  jobs: z.array(jobName).min(1).max(9),
});

export async function POST(request: Request) {
  const access = requireBearerSecret(request, process.env.CRON_SECRET);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.reason }, { status: access.status });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const result = await runSupervisor(new Date(), parsed.data.jobs, 'manual');
  return NextResponse.json({ ok: true, ...result });
}

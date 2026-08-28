import { NextResponse } from 'next/server';
import { bearerSecretMatches } from '@/lib/security/request-auth';
import { seedValidationUniverse } from '@/lib/db/seed-validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || !bearerSecretMatches(auth, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const result = await seedValidationUniverse();
  if (!result.ok) return NextResponse.json(result, { status: 503 });
  return NextResponse.json({ ...result, mode: 'shadow', capitalExecutionEnabled: false });
}

import { timingSafeEqual } from 'node:crypto';

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requireBearerSecret(request: Request, secret: string | undefined) {
  if (!secret) return { ok: false as const, reason: 'secret_not_configured' as const, status: 503 as const };
  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!safeEqual(auth, expected)) return { ok: false as const, reason: 'unauthorized' as const, status: 401 as const };
  return { ok: true as const };
}

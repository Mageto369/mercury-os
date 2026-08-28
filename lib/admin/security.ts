import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'mercury_admin_session';

function token() {
  return process.env.MERCURY_ADMIN_TOKEN ?? '';
}

function digest(value: string) {
  return createHmac('sha256', token()).update(value).digest('hex');
}

export function adminConfigured() {
  return token().length >= 24;
}

export function verifyAdminToken(candidate: string | null | undefined) {
  const expected = token();
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminSessionValue() {
  if (!adminConfigured()) return '';
  return digest('mercury-admin-session:v1');
}

export function adminAuthorized(request: Request) {
  if (!adminConfigured()) return false;
  const cookie = request.headers.get('cookie') ?? '';
  const session = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const expected = adminSessionValue();
  if (!session || !expected) return false;
  const a = Buffer.from(session);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminCookie(value: string, maxAgeSeconds = 60 * 60 * 8) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearAdminCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function sameOriginMutation(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host');
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

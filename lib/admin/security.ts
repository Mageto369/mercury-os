import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'mercury_admin_session';
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

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

export function adminSessionMaxAgeSeconds() {
  const configured = Number(process.env.MERCURY_ADMIN_SESSION_MAX_AGE_SECONDS ?? DEFAULT_SESSION_MAX_AGE_SECONDS);
  return Number.isInteger(configured) && configured >= 300 && configured <= 86_400 ? configured : DEFAULT_SESSION_MAX_AGE_SECONDS;
}

export function adminSessionValue(nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!adminConfigured()) return '';
  const payload = `v2.${nowSeconds}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${digest(payload)}`;
}

export function adminAuthorized(request: Request, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!adminConfigured()) return false;
  const cookie = request.headers.get('cookie') ?? '';
  const session = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!session) return false;
  const parts = session.split('.');
  if (parts.length !== 4 || parts[0] !== 'v2' || !/^\d+$/.test(parts[1]) || !/^[a-f0-9]{32}$/.test(parts[2]) || !/^[a-f0-9]{64}$/.test(parts[3])) return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > nowSeconds + 60 || nowSeconds - issuedAt > adminSessionMaxAgeSeconds()) return false;
  const expected = digest(parts.slice(0, 3).join('.'));
  const a = Buffer.from(parts[3]);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminCookie(value: string, maxAgeSeconds = adminSessionMaxAgeSeconds()) {
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

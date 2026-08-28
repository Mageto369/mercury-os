import { expect, test } from '@playwright/test';
import { adminAuthorized, adminSessionMaxAgeSeconds, adminSessionValue } from '../../lib/admin/security';

test('admin sessions are signed, unique, and expire on the server', () => {
  const originalToken = process.env.MERCURY_ADMIN_TOKEN;
  const originalMaxAge = process.env.MERCURY_ADMIN_SESSION_MAX_AGE_SECONDS;
  try {
    process.env.MERCURY_ADMIN_TOKEN = 'mercury-admin-security-test-token';
    process.env.MERCURY_ADMIN_SESSION_MAX_AGE_SECONDS = '600';
    const issuedAt = 2_000_000_000;
    const first = adminSessionValue(issuedAt);
    const second = adminSessionValue(issuedAt);
    expect(first).not.toBe(second);
    expect(adminSessionMaxAgeSeconds()).toBe(600);

    const request = new Request('https://mercury.example/admin', { headers:{ cookie:`mercury_admin_session=${first}` } });
    expect(adminAuthorized(request, issuedAt)).toBe(true);
    expect(adminAuthorized(request, issuedAt + 600)).toBe(true);
    expect(adminAuthorized(request, issuedAt + 601)).toBe(false);

    const tampered = `${first.slice(0, -1)}${first.endsWith('0') ? '1' : '0'}`;
    const tamperedRequest = new Request('https://mercury.example/admin', { headers:{ cookie:`mercury_admin_session=${tampered}` } });
    expect(adminAuthorized(tamperedRequest, issuedAt)).toBe(false);
  } finally {
    if (originalToken === undefined) delete process.env.MERCURY_ADMIN_TOKEN;
    else process.env.MERCURY_ADMIN_TOKEN = originalToken;
    if (originalMaxAge === undefined) delete process.env.MERCURY_ADMIN_SESSION_MAX_AGE_SECONDS;
    else process.env.MERCURY_ADMIN_SESSION_MAX_AGE_SECONDS = originalMaxAge;
  }
});

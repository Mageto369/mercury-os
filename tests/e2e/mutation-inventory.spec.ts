import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type APIRequestContext } from '@playwright/test';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function apiPath(file: string) {
  const relative = path.relative(path.join(process.cwd(), 'app'), path.dirname(file));
  return '/' + relative.split(path.sep).join('/').replace(/\[([^\]]+)\]/g, 'stress-missing');
}

const routeFiles = walk(path.join(process.cwd(), 'app', 'api')).filter((file) => file.endsWith(`${path.sep}route.ts`));
const methods = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const mutations = routeFiles.flatMap((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return methods
    .filter((method) => new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(source))
    .map((method) => ({ method, route: apiPath(file) }));
});

const approvedUnauthenticated2xx = new Set(['POST /api/control/pulse']);

async function invoke(request: APIRequestContext, method: typeof methods[number], route: string) {
  return request.fetch(route, {
    method,
    headers: { 'content-type': 'application/json' },
    data: {},
    timeout: 20_000,
  });
}

test('every discovered mutation route is fail-closed unless explicitly harmless', async ({ request }) => {
  test.setTimeout(180_000);
  expect(mutations.length).toBeGreaterThan(20);
  const violations: Array<{ method: string; route: string; status: number }> = [];
  for (const mutation of mutations) {
    const response = await invoke(request, mutation.method, mutation.route);
    const key = `${mutation.method} ${mutation.route}`;
    if (response.ok() && !approvedUnauthenticated2xx.has(key)) {
      violations.push({ ...mutation, status: response.status() });
    }
    expect(response.status(), `${key} returned an unhandled server error`).not.toBe(500);
  }
  expect(violations, `Unauthenticated mutation routes returned 2xx:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
});

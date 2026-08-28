import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function routePath(file: string) {
  const relative = path.relative(path.join(process.cwd(), 'app'), path.dirname(file));
  return '/' + relative.split(path.sep).join('/');
}

const files = walk(path.join(process.cwd(), 'app', 'api')).filter((file) => file.endsWith(`${path.sep}route.ts`));
const staticGetRoutes = files
  .filter((file) => !file.includes(`${path.sep}[`))
  .filter((file) => /export\s+async\s+function\s+GET\b/.test(fs.readFileSync(file, 'utf8')))
  .map(routePath)
  .sort();

test.describe('api inventory coverage', () => {
  test(`all ${staticGetRoutes.length} static GET routes avoid server errors`, async ({ request }) => {
    test.setTimeout(180_000);
    expect(staticGetRoutes.length).toBeGreaterThan(20);
    const failures: Array<{ route: string; status: number; body: string }> = [];
    for (const route of staticGetRoutes) {
      const response = await request.get(route, { timeout: 20_000 });
      if (response.status() >= 500 && response.status() !== 503) {
        failures.push({ route, status: response.status(), body: (await response.text()).slice(0, 500) });
      }
      expect(response.status(), `${route} should return a controlled response`).toBeLessThan(600);
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });
});

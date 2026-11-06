/** Controlled state fixtures, separate from the unmocked positive journeys.
 * Loading requests continue to the real backend; invalid-contract fixtures first
 * verify a live successful response, then restore live traffic for the retry.
 */
import { expect, test } from '@playwright/test';

const checks = [
  {
    name: 'health', path: '/api/health',
    payload: { status: 'ok' },
    waiting: 'Waiting for the backend response…',
    error: 'The backend returned an invalid health response. Try again.'
  },
  {
    name: 'readiness', path: '/api/v1/readiness',
    payload: { status: 'ready', database: 'sqlite', schemaVersion: 1 },
    waiting: 'Waiting for the database readiness response…',
    error: 'The backend returned an invalid readiness response. Try again.'
  }
];

for (const check of checks) {
  test(`controlled ${check.name} loading disables the check until the live response arrives`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') { errors.push(message.text()); } });
    page.on('pageerror', (error) => { errors.push(error.message); });
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    const endpoint = `**${check.path}`;
    await page.route(endpoint, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/');
    const liveResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === check.path && response.request().method() === 'GET'
    );
    try {
      if (check.name === 'readiness') {
        await page.getByRole('link', { name: 'Database readiness' }).click();
        await expect(page).toHaveURL('/readiness');
      } else {
        await page.getByRole('button', { name: 'Check backend' }).click();
      }
      await expect(page.getByRole('button', { name: 'Checking…', exact: true })).toBeDisabled();
      await expect(page.getByRole('status')).toHaveText(check.waiting);
    } finally {
      release();
    }
    const response = await liveResponse;
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual(check.payload);
    await expect(page.getByRole('status')).toContainText(`Response status: ${payload.status}`);
    if (check.name === 'readiness') {
      await expect(page.getByRole('status')).toContainText(`Database: ${payload.database}. Schema version: ${payload.schemaVersion}.`);
    }
    await expect(page.getByRole('button', { name: 'Check again', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.unroute(endpoint);
    expect(errors).toEqual([]);
  });

  test(`controlled ${check.name} invalid contract shows a safe error and retries against the live backend`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') { errors.push(message.text()); } });
    page.on('pageerror', (error) => { errors.push(error.message); });
    const endpoint = `**${check.path}`;
    await page.route(endpoint, async (route) => {
      const upstream = await route.fetch();
      expect(upstream.status()).toBe(200);
      expect(await upstream.json()).toEqual(check.payload);
      // Keep HTTP successful: exercise contract validation, not an HTTP console error.
      await route.fulfill({ response: upstream, status: 200, json: { status: 'private/path.db' } });
    });
    await page.goto('/');
    if (check.name === 'readiness') {
      await page.getByRole('link', { name: 'Database readiness' }).click();
      await expect(page).toHaveURL('/readiness');
    } else {
      await page.getByRole('button', { name: 'Check backend' }).click();
    }
    await expect(page.getByRole('alert')).toHaveText(check.error);
    await expect(page.getByRole('status')).not.toContainText('Response status:');
    await expect(page.getByRole('button', { name: 'Retry check', exact: true })).toBeEnabled();
    await page.unroute(endpoint);
    const retried = page.waitForResponse((response) =>
      new URL(response.url()).pathname === check.path && response.request().method() === 'GET'
    );
    await page.getByRole('button', { name: 'Retry check', exact: true }).click();
    const response = await retried;
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual(check.payload);
    await expect(page.getByRole('status')).toContainText(`Response status: ${payload.status}`);
    if (check.name === 'readiness') {
      await expect(page.getByRole('status')).toContainText(`Database: ${payload.database}. Schema version: ${payload.schemaVersion}.`);
    }
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check again', exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  });
}

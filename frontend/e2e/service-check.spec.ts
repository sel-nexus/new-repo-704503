/** Prove real frontend-to-backend wiring without route or response mocks. */
import { test, expect } from '@playwright/test';

test('checks the live service and performs a fresh repeat check', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') { errors.push(message.text()); } });
  page.on('pageerror', (error) => { errors.push(error.message); });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Not checked yet');
  const firstResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/health' && response.request().method() === 'GET'
  );
  await page.getByRole('button', { name: 'Check backend' }).click();
  const response = await firstResponse;
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload).toEqual({ status: 'ok' });
  await expect(page.getByRole('status')).toContainText(`Response status: ${payload.status}`);
  const nextResponse = page.waitForResponse((result) =>
    new URL(result.url()).pathname === '/api/health' && result.request().method() === 'GET'
  );
  await page.getByRole('button', { name: 'Check again' }).click();
  expect((await nextResponse).status()).toBe(200);
  await expect(page.getByRole('status')).toContainText('Backend connected');
  await page.screenshot({ path: testInfo.outputPath('service-check.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('recovers from an unknown URL through the home link', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') { errors.push(message.text()); } });
  page.on('pageerror', (error) => { errors.push(error.message); });
  await page.goto('/unknown-page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found.');
  await page.getByRole('link', { name: 'Return home' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Check backend' })).toBeVisible();
  expect(errors).toEqual([]);
});

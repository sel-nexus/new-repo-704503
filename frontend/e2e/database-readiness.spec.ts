/** Prove real SQLite readiness, linked navigation and reload without network mocks. */
import { expect, test } from '@playwright/test';

test('navigates to live database readiness, reloads and returns home', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') { errors.push(message.text()); } });
  page.on('pageerror', (error) => { errors.push(error.message); });
  await page.goto('/');
  const initial = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/v1/readiness' && response.request().method() === 'GET'
  );
  await page.getByRole('link', { name: 'Database readiness' }).click();
  await expect(page).toHaveURL('/readiness');
  const response = await initial;
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload).toEqual({ status: 'ready', database: 'sqlite', schemaVersion: 1 });
  await expect(page.getByRole('status')).toContainText(`Response status: ${payload.status}`);
  await expect(page.getByRole('status')).toContainText(`Database: ${payload.database}. Schema version: ${payload.schemaVersion}.`);
  const reloaded = page.waitForResponse((result) =>
    new URL(result.url()).pathname === '/api/v1/readiness' && result.request().method() === 'GET'
  );
  await page.reload();
  const persisted = await reloaded;
  expect(persisted.status()).toBe(200);
  expect(await persisted.json()).toEqual(payload);
  await expect(page.getByRole('status')).toContainText(`Schema version: ${payload.schemaVersion}.`);
  const repeated = page.waitForResponse((result) =>
    new URL(result.url()).pathname === '/api/v1/readiness' && result.request().method() === 'GET'
  );
  await page.getByRole('button', { name: 'Check again' }).click();
  expect((await repeated).status()).toBe(200);
  await expect(page.getByRole('status')).toContainText(`Database: ${payload.database}`);
  await page.screenshot({ path: testInfo.outputPath('database-readiness.png'), fullPage: true });
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Check backend' })).toBeVisible();
  expect(errors).toEqual([]);
});

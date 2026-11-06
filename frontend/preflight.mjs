/** Capture representative rendered states without rerunning journey tests. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const backend = spawn(process.execPath, ['dist/index.js'], { cwd: '../backend', env: { ...process.env, DATABASE_URL: 'file:/tmp/starter-preflight.db', PORT: '3001' }, stdio: 'ignore' });
const frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { stdio: 'ignore' });
for (let attempt = 0; attempt < 30; attempt++) {
  try { if ((await fetch('http://127.0.0.1:5173')).ok && (await fetch('http://127.0.0.1:3001/api/health')).ok) { break; } } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const browser = await chromium.launch({ headless: true });
await mkdir('review-artifacts', { recursive: true });
const captures = [];
try {
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 393, 851]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(process.env.PREFLIGHT_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: 'Check backend' }).waitFor();
    captures.push(`${name} home\n${await page.locator('body').ariaSnapshot()}\n${await page.content()}`);
    await page.screenshot({ path: `review-artifacts/${name}-home.png`, fullPage: true });
    await page.getByRole('link', { name: 'Database readiness' }).click();
    await page.getByRole('button', { name: 'Check again', exact: true }).waitFor();
    const styles = await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, background: getComputedStyle(document.body).backgroundColor, mainWidth: getComputedStyle(document.querySelector('main')).width, overflow: document.documentElement.scrollWidth > innerWidth }));
    captures.push(`${name} readiness\n${await page.locator('body').ariaSnapshot()}\n${JSON.stringify(styles)}\n${await page.content()}`);
    await page.screenshot({ path: `review-artifacts/${name}-readiness.png`, fullPage: true });
    await page.close();
  }
  await writeFile('review-artifacts/preflight.txt', captures.join('\n\n'));
} finally {
  await browser.close();
  frontend.kill('SIGTERM');
  backend.kill('SIGTERM');
}

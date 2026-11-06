/** Start both real tiers for deterministic desktop and mobile journeys. */
import { defineConfig, devices } from '@playwright/test';

const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 5173);
const backendPort = Number(process.env.E2E_BACKEND_PORT ?? 3001);
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const backendUrl = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1,
  use: { baseURL: frontendUrl, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: [
    {
      command: 'npm run build && npm start', cwd: '../backend',
      url: `${backendUrl}/api/health`, reuseExistingServer: false, timeout: 60000,
      env: { NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(backendPort), CORS_ORIGINS: frontendUrl, DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'file:/tmp/starter-e2e.db' }
    },
    {
      command: 'npm run dev', url: frontendUrl, reuseExistingServer: false, timeout: 60000,
      env: { DEV_HOST: '127.0.0.1', DEV_PORT: String(frontendPort), DEV_API_PROXY_TARGET: backendUrl, VITE_API_BASE_URL: '/' }
    }
  ]
});

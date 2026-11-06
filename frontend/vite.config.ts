/** Configure the independent SPA build and environment-driven dev proxy. */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const port = Number(env.DEV_PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { throw new Error('Invalid DEV_PORT'); }
  return {
    plugins: [react()],
    server: {
      host: env.DEV_HOST ?? '0.0.0.0', port, strictPort: true,
      proxy: { '/api': { target: env.DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:3001', changeOrigin: true } }
    }
  };
});

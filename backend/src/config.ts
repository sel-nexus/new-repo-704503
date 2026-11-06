/** Validate environment configuration without opening a database. */
import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const origin = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}, 'Use an HTTP origin without a path');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGINS: z.string().default('').transform((value) =>
    value.split(',').map((item) => item.trim()).filter(Boolean)
  ).pipe(z.array(origin)),
  DATABASE_URL: z.string().default('file:./data/starter.db').refine((value) =>
    /^file:(?!\/\/)[^?#]+$/.test(value) && !value.includes(':memory:'),
    'Use a local file URL, not an in-memory database'
  )
});

/** Fail fast on invalid runtime settings.
 * Args:
 *   env: Environment values injected by the host or local dotenv file.
 * Returns:
 *   Validated listener, CORS and future database settings.
 * Raises:
 *   Error: Configuration is invalid; only field names are disclosed.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  return result.data;
}

export type Config = ReturnType<typeof loadConfig>;

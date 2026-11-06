/** Check SQLite readiness without changing application state. */
import type { DatabaseSync } from 'node:sqlite';

export interface ReadinessResponse { status: 'ready'; database: 'sqlite'; schemaVersion: 1 }

/** Query the stored singleton version and fail closed on absent or invalid state.
 * Args:
 *   database: The startup-owned connection; absence never opens a fallback.
 * Returns:
 *   The validated readiness result.
 * Raises:
 *   Error: A safe unavailable message for closed, missing or failed databases.
 */
export function checkReadiness(database?: DatabaseSync): ReadinessResponse {
  try {
    if (!database) { throw new Error('Missing connection'); }
    const rows = database.prepare('SELECT id, version FROM schema_version').all();
    if (rows.length !== 1 || rows[0].id !== 1 || rows[0].version !== 1) {
      throw new Error('Invalid schema version');
    }
    return { status: 'ready', database: 'sqlite', schemaVersion: 1 };
  } catch {
    throw new Error('Database unavailable');
  }
}

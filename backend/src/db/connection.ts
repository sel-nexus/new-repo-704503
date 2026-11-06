/** Open file-backed SQLite and initialize only internal schema metadata. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/** Apply the initial metadata migration atomically and repeatedly without data loss.
 * Args:
 *   database: The application's open file-backed connection.
 * Raises:
 *   Error: SQLite rejects the schema or the stored version is unsupported.
 */
export function migrateDatabase(database: DatabaseSync): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL CHECK (version = 1)
      ) STRICT;
      INSERT INTO schema_version (id, version) VALUES (1, 1)
        ON CONFLICT (id) DO NOTHING;
    `);
    const rows = database.prepare('SELECT id, version FROM schema_version').all();
    if (rows.length !== 1 || rows[0].id !== 1 || rows[0].version !== 1) {
      throw new Error('Unsupported database schema');
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

/** Open a real local file, creating its parent directory and migrating before use.
 * Args:
 *   url: A file: URL with a relative or absolute local path, without URI options.
 * Returns:
 *   An open connection owned by the caller; startup creates exactly one.
 * Raises:
 *   Error: Invalid URL or unavailable database; paths are never disclosed.
 */
export function openDatabase(url: string): DatabaseSync {
  let database: DatabaseSync | undefined;
  try {
    if (!/^file:(?!\/\/)[^?#]+$/.test(url)) { throw new Error('Invalid URL'); }
    const filename = decodeURIComponent(url.slice(5));
    if (!filename.trim() || filename.includes(':') || /[\x00-\x1f]/.test(filename)) {
      throw new Error('Invalid file path');
    }
    const resolved = path.resolve(filename);
    mkdirSync(path.dirname(resolved), { recursive: true });
    database = new DatabaseSync(resolved);
    migrateDatabase(database);
    return database;
  } catch {
    if (database?.isOpen) { database.close(); }
    throw new Error('Database unavailable');
  }
}

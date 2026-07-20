import Database from 'better-sqlite3';
import path from 'path';

let db;

/**
 * Lazily open a single shared, read-only connection to the visa bulletin
 * SQLite database (data/visa_bulletin.db). Re-run scraper/scraper.py (see
 * the project README) and copy the resulting file here to refresh the data.
 */
export function getDb() {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'data', 'visa_bulletin.db');
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }
  return db;
}

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "indexy.db");
let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        status TEXT NOT NULL,
        checked_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        total_urls INTEGER NOT NULL DEFAULT 0,
        indexed_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS batch_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        status TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        FOREIGN KEY (batch_id) REFERENCES batches(id)
      );
      CREATE TABLE IF NOT EXISTS rate_limits (
        ip TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        last_reset TEXT NOT NULL
      );
    `);
  }
  return db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ScanRecord {
  id: number;
  url: string;
  status: "INDEXED" | "NOT_INDEXED";
  checked_at: string;
}

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  plan: string;
  created_at: string;
}

export interface Batch {
  id: number;
  user_id: number;
  total_urls: number;
  indexed_count: number;
  created_at: string;
}

export interface BatchResult {
  id: number;
  batch_id: number;
  url: string;
  status: string;
  checked_at: string;
}

// ─── Guest Scan Helpers ───────────────────────────────────────────────────────
export function saveScan(url: string, status: "INDEXED" | "NOT_INDEXED") {
  const database = getDb();
  database.prepare(
    "INSERT INTO scans (url, status, checked_at) VALUES (?, ?, ?)"
  ).run(url, status, new Date().toISOString());
}

export function getRecentScans(limit: number = 20): ScanRecord[] {
  const database = getDb();
  return database.prepare(
    "SELECT * FROM scans ORDER BY id DESC LIMIT ?"
  ).all(limit) as ScanRecord[];
}

export function getCachedScan(url: string, maxAgeHours: number = 24): ScanRecord | null {
  const database = getDb();
  const row = database.prepare(
    "SELECT * FROM scans WHERE url = ? ORDER BY id DESC LIMIT 1"
  ).get(url) as ScanRecord | undefined;
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.checked_at).getTime();
  return ageMs <= maxAgeHours * 3_600_000 ? row : null;
}

// ─── User Helpers ─────────────────────────────────────────────────────────────
export function createUser(email: string, passwordHash: string, name: string): User {
  const database = getDb();
  const result = database.prepare(
    "INSERT INTO users (email, password_hash, name, plan, created_at) VALUES (?, ?, ?, 'free', ?)"
  ).run(email, passwordHash, name, new Date().toISOString());
  return getUserById(result.lastInsertRowid as number)!;
}

export function getUserByEmail(email: string): User | null {
  const database = getDb();
  return (database.prepare("SELECT * FROM users WHERE email = ?").get(email) as User) ?? null;
}

export function getUserById(id: number): User | null {
  const database = getDb();
  return (database.prepare("SELECT * FROM users WHERE id = ?").get(id) as User) ?? null;
}

// ─── Batch Helpers ────────────────────────────────────────────────────────────
export function createBatch(userId: number, totalUrls: number): Batch {
  const database = getDb();
  const result = database.prepare(
    "INSERT INTO batches (user_id, total_urls, indexed_count, created_at) VALUES (?, ?, 0, ?)"
  ).run(userId, totalUrls, new Date().toISOString());
  return database.prepare("SELECT * FROM batches WHERE id = ?").get(result.lastInsertRowid) as Batch;
}

export function saveBatchResult(batchId: number, url: string, status: string): void {
  const database = getDb();
  database.prepare(
    "INSERT INTO batch_results (batch_id, url, status, checked_at) VALUES (?, ?, ?, ?)"
  ).run(batchId, url, status, new Date().toISOString());
  if (status === "INDEXED") {
    database.prepare(
      "UPDATE batches SET indexed_count = indexed_count + 1 WHERE id = ?"
    ).run(batchId);
  }
}

export function getUserStats(userId: number) {
  const database = getDb();
  const totalChecked = (database.prepare(
    "SELECT COALESCE(SUM(total_urls), 0) as total FROM batches WHERE user_id = ?"
  ).get(userId) as { total: number }).total;

  const totalIndexed = (database.prepare(
    "SELECT COALESCE(SUM(indexed_count), 0) as total FROM batches WHERE user_id = ?"
  ).get(userId) as { total: number }).total;

  const lastBatch = database.prepare(
    "SELECT * FROM batches WHERE user_id = ? ORDER BY id DESC LIMIT 1"
  ).get(userId) as Batch | undefined;

  return {
    totalChecked,
    totalIndexed,
    avgIndexRate: totalChecked > 0 ? Math.round((totalIndexed / totalChecked) * 100) : 0,
    lastChecked: lastBatch?.created_at ?? null,
    lastBatchSize: lastBatch?.total_urls ?? 0,
  };
}

export function getUserBatches(userId: number, limit: number = 20): Batch[] {
  const database = getDb();
  return database.prepare(
    "SELECT * FROM batches WHERE user_id = ? ORDER BY id DESC LIMIT ?"
  ).all(userId, limit) as Batch[];
}

export function getBatchResults(batchId: number): BatchResult[] {
  const database = getDb();
  return database.prepare(
    "SELECT * FROM batch_results WHERE batch_id = ? ORDER BY id ASC"
  ).all(batchId) as BatchResult[];
}

// ─── IP Rate Limiting Helpers ────────────────────────────────────────────────
export function getIpUsage(ip: string): { count: number; last_reset: string } {
  const database = getDb();
  const today = new Date().toDateString();
  const row = database.prepare("SELECT count, last_reset FROM rate_limits WHERE ip = ?").get(ip) as { count: number; last_reset: string } | undefined;

  if (!row || row.last_reset !== today) {
    // Reset if new day or no record
    database.prepare("INSERT OR REPLACE INTO rate_limits (ip, count, last_reset) VALUES (?, 0, ?)").run(ip, today);
    return { count: 0, last_reset: today };
  }

  return row;
}

export function incrementIpUsage(ip: string, amount: number): void {
  const database = getDb();
  const today = new Date().toDateString();
  database.prepare(`
    UPDATE rate_limits 
    SET count = count + ?, last_reset = ? 
    WHERE ip = ?
  `).run(amount, today, ip);
}

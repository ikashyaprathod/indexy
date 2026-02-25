import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "indexy.db");
let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    try {
      db = new Database(DB_PATH);
      // Ensure we are in write mode if possible
      db.pragma("journal_mode = WAL");
    } catch (err: any) {
      console.error("[DB Init Error]", err);
      throw err;
    }

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
        created_at TEXT NOT NULL,
        role TEXT DEFAULT 'user'
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
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Primitive Migration: Add 'role' column to 'users' if it doesn't exist
    try {
      db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'").run();
    } catch (e) {
      // Column probably exists
    }

    // Initialize default settings
    try {
      const currentSettings = db.prepare("SELECT COUNT(*) as count FROM settings").get() as { count: number };
      if (currentSettings.count === 0) {
        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("guest_mode", "true");
        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("public_signup", "true");
      }
    } catch (err) {
      console.error("[DB Settings Init Error]", err);
    }
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
  role: string;
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

// ─── Settings Helpers ────────────────────────────────────────────────────────
export function getSetting(key: string, defaultValue: string): string {
  const database = getDb();
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? defaultValue;
}

export function updateSetting(key: string, value: string): void {
  const database = getDb();
  database.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

// ─── Admin Helpers ────────────────────────────────────────────────────────────
export function getGlobalStats() {
  const database = getDb();
  const batchUrls = (database.prepare("SELECT COALESCE(SUM(total_urls), 0) as total FROM batches").get() as { total: number }).total;
  const scanUrls = (database.prepare("SELECT COUNT(*) as total FROM scans").get() as { total: number }).total;
  const totalUrls = batchUrls + scanUrls;

  const totalUsers = (database.prepare("SELECT COUNT(*) as total FROM users").get() as { total: number }).total;
  const guestUsers24h = (database.prepare("SELECT COUNT(DISTINCT ip) as total FROM rate_limits WHERE last_reset = ?").get(new Date().toDateString()) as { total: number }).total;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const newUsers7d = (database.prepare("SELECT COUNT(*) as total FROM users WHERE created_at >= ?").get(sevenDaysAgo.toISOString()) as { total: number }).total;

  return { totalUrls, totalUsers, guestUsers24h, newUsers7d };
}

export function getAdminRecentChecks(limit: number = 20) {
  const database = getDb();
  // Combine batches (registered users) and scans (guests)
  return database.prepare(`
    SELECT 
      'batch' as type,
      b.id,
      u.email,
      u.plan,
      b.total_urls,
      b.indexed_count,
      b.created_at
    FROM batches b
    JOIN users u ON b.user_id = u.id
    UNION ALL
    SELECT 
      'scan' as type,
      s.id,
      'Guest User' as email,
      'guest' as plan,
      1 as total_urls,
      CASE WHEN s.status = 'INDEXED' THEN 1 ELSE 0 END as indexed_count,
      s.checked_at as created_at
    FROM scans s
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as any[];
}

export function getAllUsers() {
  const database = getDb();
  return database.prepare(`
    SELECT 
      id, email, name, role, plan, created_at,
      (SELECT COALESCE(SUM(total_urls), 0) FROM batches WHERE user_id = users.id) as total_checks
    FROM users
    ORDER BY id DESC
  `).all() as any[];
}

export function updatePremiumStatus(email: string, isPremium: boolean): void {
  const database = getDb();
  database.prepare("UPDATE users SET plan = ? WHERE email = ?").run(isPremium ? 'premium' : 'free', email);
}

export function setUserRole(email: string, role: string): void {
  const database = getDb();
  database.prepare("UPDATE users SET role = ? WHERE email = ?").run(role, email);
}

// Auto-switches: Neon Postgres when DATABASE_URL is set (Vercel), SQLite locally.
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import path from "path";

const USE_NEON = !!process.env.DATABASE_URL;

// ── Neon client (production) ──────────────────────────────────────────────────
let _neon: NeonQueryFunction<false, false> | null = null;
function getNeon() {
  if (!_neon) _neon = neon(process.env.DATABASE_URL!);
  return _neon;
}

let neonReady: Promise<void> | null = null;
async function ensureNeon(): Promise<void> {
  if (!neonReady) {
    const sql = getNeon();
    neonReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS scans (id SERIAL PRIMARY KEY, url TEXT NOT NULL, status TEXT NOT NULL, checked_at TEXT NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'free', created_at TEXT NOT NULL, role TEXT DEFAULT 'user')`;
      await sql`CREATE TABLE IF NOT EXISTS batches (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, total_urls INTEGER NOT NULL DEFAULT 0, indexed_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS batch_results (id SERIAL PRIMARY KEY, batch_id INTEGER NOT NULL, url TEXT NOT NULL, status TEXT NOT NULL, checked_at TEXT NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS rate_limits (ip TEXT PRIMARY KEY, count INTEGER DEFAULT 0, last_reset TEXT NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
      await sql`INSERT INTO settings (key, value) VALUES ('guest_mode', 'true'), ('public_signup', 'true') ON CONFLICT (key) DO NOTHING`;
    })().catch((e) => { neonReady = null; throw e; });
  }
  return neonReady;
}

// ── SQLite client (local dev) ─────────────────────────────────────────────────
let _sqlite: any = null;
function getSqlite() {
  if (_sqlite) return _sqlite;
  // Dynamic require keeps better-sqlite3 out of the Vercel bundle
  const Database = require("better-sqlite3");
  const db = new Database(path.join(process.cwd(), "indexy.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, status TEXT NOT NULL, checked_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'free', created_at TEXT NOT NULL, role TEXT DEFAULT 'user');
    CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, total_urls INTEGER NOT NULL DEFAULT 0, indexed_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS batch_results (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL, url TEXT NOT NULL, status TEXT NOT NULL, checked_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (ip TEXT PRIMARY KEY, count INTEGER DEFAULT 0, last_reset TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  try { db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'").run(); } catch {}
  const count = (db.prepare("SELECT COUNT(*) as c FROM settings").get() as any).c;
  if (count === 0) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("guest_mode", "true");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("public_signup", "true");
  }
  _sqlite = db;
  return db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ScanRecord { id: number; url: string; status: "INDEXED" | "NOT_INDEXED"; checked_at: string; }
export interface User { id: number; email: string; password_hash: string; name: string; plan: string; role: string; created_at: string; }
export interface Batch { id: number; user_id: number; total_urls: number; indexed_count: number; created_at: string; }
export interface BatchResult { id: number; batch_id: number; url: string; status: string; checked_at: string; }

// ─── Scan Helpers ─────────────────────────────────────────────────────────────
export async function saveScan(url: string, status: "INDEXED" | "NOT_INDEXED"): Promise<void> {
  const now = new Date().toISOString();
  if (USE_NEON) {
    await ensureNeon(); await getNeon()`INSERT INTO scans (url, status, checked_at) VALUES (${url}, ${status}, ${now})`;
  } else {
    getSqlite().prepare("INSERT INTO scans (url, status, checked_at) VALUES (?, ?, ?)").run(url, status, now);
  }
}

export async function getRecentScans(limit = 20): Promise<ScanRecord[]> {
  if (USE_NEON) {
    await ensureNeon(); return (await getNeon()`SELECT * FROM scans ORDER BY id DESC LIMIT ${limit}`) as ScanRecord[];
  }
  return getSqlite().prepare("SELECT * FROM scans ORDER BY id DESC LIMIT ?").all(limit) as ScanRecord[];
}

export async function getCachedScan(url: string, maxAgeHours = 24): Promise<ScanRecord | null> {
  let row: ScanRecord | undefined;
  if (USE_NEON) {
    await ensureNeon();
    const rows = await getNeon()`SELECT * FROM scans WHERE url = ${url} ORDER BY id DESC LIMIT 1`;
    row = rows[0] as ScanRecord | undefined;
  } else {
    row = getSqlite().prepare("SELECT * FROM scans WHERE url = ? ORDER BY id DESC LIMIT 1").get(url) as ScanRecord | undefined;
  }
  if (!row) return null;
  return Date.now() - new Date(row.checked_at).getTime() <= maxAgeHours * 3_600_000 ? row : null;
}

// ─── User Helpers ─────────────────────────────────────────────────────────────
export async function createUser(email: string, passwordHash: string, name: string): Promise<User> {
  const now = new Date().toISOString();
  if (USE_NEON) {
    await ensureNeon();
    const rows = await getNeon()`INSERT INTO users (email, password_hash, name, plan, created_at) VALUES (${email}, ${passwordHash}, ${name}, 'free', ${now}) RETURNING *`;
    return rows[0] as User;
  }
  const db = getSqlite();
  const r = db.prepare("INSERT INTO users (email, password_hash, name, plan, created_at) VALUES (?, ?, ?, 'free', ?)").run(email, passwordHash, name, now);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(r.lastInsertRowid) as User;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  if (USE_NEON) {
    await ensureNeon();
    const rows = await getNeon()`SELECT * FROM users WHERE email = ${email}`;
    return (rows[0] as User) ?? null;
  }
  return (getSqlite().prepare("SELECT * FROM users WHERE email = ?").get(email) as User) ?? null;
}

export async function getUserById(id: number): Promise<User | null> {
  if (USE_NEON) {
    await ensureNeon();
    const rows = await getNeon()`SELECT * FROM users WHERE id = ${id}`;
    return (rows[0] as User) ?? null;
  }
  return (getSqlite().prepare("SELECT * FROM users WHERE id = ?").get(id) as User) ?? null;
}

// ─── Batch Helpers ────────────────────────────────────────────────────────────
export async function createBatch(userId: number, totalUrls: number): Promise<Batch> {
  const now = new Date().toISOString();
  if (USE_NEON) {
    await ensureNeon();
    const rows = await getNeon()`INSERT INTO batches (user_id, total_urls, indexed_count, created_at) VALUES (${userId}, ${totalUrls}, 0, ${now}) RETURNING *`;
    return rows[0] as Batch;
  }
  const db = getSqlite();
  const r = db.prepare("INSERT INTO batches (user_id, total_urls, indexed_count, created_at) VALUES (?, ?, 0, ?)").run(userId, totalUrls, now);
  return db.prepare("SELECT * FROM batches WHERE id = ?").get(r.lastInsertRowid) as Batch;
}

export async function saveBatchResult(batchId: number, url: string, status: string): Promise<void> {
  const now = new Date().toISOString();
  if (USE_NEON) {
    await ensureNeon();
    const sql = getNeon();
    await sql`INSERT INTO batch_results (batch_id, url, status, checked_at) VALUES (${batchId}, ${url}, ${status}, ${now})`;
    if (status === "INDEXED") await sql`UPDATE batches SET indexed_count = indexed_count + 1 WHERE id = ${batchId}`;
  } else {
    const db = getSqlite();
    db.prepare("INSERT INTO batch_results (batch_id, url, status, checked_at) VALUES (?, ?, ?, ?)").run(batchId, url, status, now);
    if (status === "INDEXED") db.prepare("UPDATE batches SET indexed_count = indexed_count + 1 WHERE id = ?").run(batchId);
  }
}

export async function getUserStats(userId: number) {
  if (USE_NEON) {
    await ensureNeon();
    const sql = getNeon();
    const [cr, ir, lr] = await Promise.all([
      sql`SELECT COALESCE(SUM(total_urls),0) as total FROM batches WHERE user_id=${userId}`,
      sql`SELECT COALESCE(SUM(indexed_count),0) as total FROM batches WHERE user_id=${userId}`,
      sql`SELECT * FROM batches WHERE user_id=${userId} ORDER BY id DESC LIMIT 1`,
    ]);
    const tc = Number(cr[0]?.total ?? 0), ti = Number(ir[0]?.total ?? 0);
    const lb = lr[0] as Batch | undefined;
    return { totalChecked: tc, totalIndexed: ti, avgIndexRate: tc > 0 ? Math.round((ti / tc) * 100) : 0, lastChecked: lb?.created_at ?? null, lastBatchSize: lb?.total_urls ?? 0 };
  }
  const db = getSqlite();
  const tc = Number((db.prepare("SELECT COALESCE(SUM(total_urls),0) as t FROM batches WHERE user_id=?").get(userId) as any).t);
  const ti = Number((db.prepare("SELECT COALESCE(SUM(indexed_count),0) as t FROM batches WHERE user_id=?").get(userId) as any).t);
  const lb = db.prepare("SELECT * FROM batches WHERE user_id=? ORDER BY id DESC LIMIT 1").get(userId) as Batch | undefined;
  return { totalChecked: tc, totalIndexed: ti, avgIndexRate: tc > 0 ? Math.round((ti / tc) * 100) : 0, lastChecked: lb?.created_at ?? null, lastBatchSize: lb?.total_urls ?? 0 };
}

export async function getUserBatches(userId: number, limit = 20): Promise<Batch[]> {
  if (USE_NEON) {
    await ensureNeon(); return (await getNeon()`SELECT * FROM batches WHERE user_id=${userId} ORDER BY id DESC LIMIT ${limit}`) as Batch[];
  }
  return getSqlite().prepare("SELECT * FROM batches WHERE user_id=? ORDER BY id DESC LIMIT ?").all(userId, limit) as Batch[];
}

export async function getBatchResults(batchId: number): Promise<BatchResult[]> {
  if (USE_NEON) {
    await ensureNeon(); return (await getNeon()`SELECT * FROM batch_results WHERE batch_id=${batchId} ORDER BY id ASC`) as BatchResult[];
  }
  return getSqlite().prepare("SELECT * FROM batch_results WHERE batch_id=? ORDER BY id ASC").all(batchId) as BatchResult[];
}

// ─── IP Rate Limiting ─────────────────────────────────────────────────────────
export async function getIpUsage(ip: string): Promise<{ count: number; last_reset: string }> {
  const today = new Date().toDateString();
  if (USE_NEON) {
    await ensureNeon();
    const rows = await getNeon()`SELECT count, last_reset FROM rate_limits WHERE ip=${ip}`;
    const row = rows[0] as { count: number; last_reset: string } | undefined;
    if (!row || row.last_reset !== today) {
      await getNeon()`INSERT INTO rate_limits (ip, count, last_reset) VALUES (${ip}, 0, ${today}) ON CONFLICT (ip) DO UPDATE SET count=0, last_reset=${today}`;
      return { count: 0, last_reset: today };
    }
    return row;
  }
  const db = getSqlite();
  const row = db.prepare("SELECT count, last_reset FROM rate_limits WHERE ip=?").get(ip) as { count: number; last_reset: string } | undefined;
  if (!row || row.last_reset !== today) {
    db.prepare("INSERT OR REPLACE INTO rate_limits (ip, count, last_reset) VALUES (?, 0, ?)").run(ip, today);
    return { count: 0, last_reset: today };
  }
  return row;
}

export async function incrementIpUsage(ip: string, amount: number): Promise<void> {
  const today = new Date().toDateString();
  if (USE_NEON) {
    await ensureNeon(); await getNeon()`UPDATE rate_limits SET count=count+${amount}, last_reset=${today} WHERE ip=${ip}`;
  } else {
    getSqlite().prepare("UPDATE rate_limits SET count=count+?, last_reset=? WHERE ip=?").run(amount, today, ip);
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export async function getSetting(key: string, defaultValue: string): Promise<string> {
  if (USE_NEON) {
    await ensureNeon();
    const rows = await getNeon()`SELECT value FROM settings WHERE key=${key}`;
    return (rows[0] as { value: string } | undefined)?.value ?? defaultValue;
  }
  const row = getSqlite().prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
  return row?.value ?? defaultValue;
}

export async function updateSetting(key: string, value: string): Promise<void> {
  if (USE_NEON) {
    await ensureNeon(); await getNeon()`INSERT INTO settings (key,value) VALUES (${key},${value}) ON CONFLICT (key) DO UPDATE SET value=${value}`;
  } else {
    getSqlite().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }
}

// ─── Admin Helpers ────────────────────────────────────────────────────────────
export async function getGlobalStats() {
  if (USE_NEON) {
    await ensureNeon();
    const sql = getNeon();
    const today = new Date().toDateString();
    const d7 = new Date(); d7.setDate(d7.getDate() - 7);
    const [br, sr, ur, gr, nr] = await Promise.all([
      sql`SELECT COALESCE(SUM(total_urls),0) as t FROM batches`,
      sql`SELECT COUNT(*) as t FROM scans`,
      sql`SELECT COUNT(*) as t FROM users`,
      sql`SELECT COUNT(DISTINCT ip) as t FROM rate_limits WHERE last_reset=${today}`,
      sql`SELECT COUNT(*) as t FROM users WHERE created_at>=${d7.toISOString()}`,
    ]);
    return { totalUrls: Number(br[0]?.t ?? 0) + Number(sr[0]?.t ?? 0), totalUsers: Number(ur[0]?.t ?? 0), guestUsers24h: Number(gr[0]?.t ?? 0), newUsers7d: Number(nr[0]?.t ?? 0) };
  }
  const db = getSqlite();
  const today = new Date().toDateString();
  const d7 = new Date(); d7.setDate(d7.getDate() - 7);
  const bu = Number((db.prepare("SELECT COALESCE(SUM(total_urls),0) as t FROM batches").get() as any).t);
  const su = Number((db.prepare("SELECT COUNT(*) as t FROM scans").get() as any).t);
  const tu = Number((db.prepare("SELECT COUNT(*) as t FROM users").get() as any).t);
  const gu = Number((db.prepare("SELECT COUNT(DISTINCT ip) as t FROM rate_limits WHERE last_reset=?").get(today) as any).t);
  const nu = Number((db.prepare("SELECT COUNT(*) as t FROM users WHERE created_at>=?").get(d7.toISOString()) as any).t);
  return { totalUrls: bu + su, totalUsers: tu, guestUsers24h: gu, newUsers7d: nu };
}

export async function getAdminRecentChecks(limit = 20) {
  const q = `
    SELECT 'batch' as type, b.id, u.email, u.plan, b.total_urls, b.indexed_count, b.created_at
    FROM batches b JOIN users u ON b.user_id=u.id
    UNION ALL
    SELECT 'scan' as type, s.id, 'Guest User' as email, 'guest' as plan, 1 as total_urls,
      CASE WHEN s.status='INDEXED' THEN 1 ELSE 0 END as indexed_count, s.checked_at as created_at
    FROM scans s
    ORDER BY created_at DESC LIMIT ${limit}`;
  if (USE_NEON) {
    await ensureNeon();
    return await getNeon()(q);
  }
  return getSqlite().prepare(q).all() as any[];
}

export async function getAllUsers() {
  if (USE_NEON) {
    await ensureNeon();
    return await getNeon()`SELECT id, email, name, role, plan, created_at, (SELECT COALESCE(SUM(total_urls),0) FROM batches WHERE user_id=users.id) as total_checks FROM users ORDER BY id DESC`;
  }
  return getSqlite().prepare("SELECT id, email, name, role, plan, created_at, (SELECT COALESCE(SUM(total_urls),0) FROM batches WHERE user_id=users.id) as total_checks FROM users ORDER BY id DESC").all() as any[];
}

export async function updatePremiumStatus(email: string, isPremium: boolean): Promise<void> {
  const plan = isPremium ? "premium" : "free";
  if (USE_NEON) {
    await ensureNeon(); await getNeon()`UPDATE users SET plan=${plan} WHERE email=${email}`;
  } else {
    getSqlite().prepare("UPDATE users SET plan=? WHERE email=?").run(plan, email);
  }
}

export async function setUserRole(email: string, role: string): Promise<void> {
  if (USE_NEON) {
    await ensureNeon(); await getNeon()`UPDATE users SET role=${role} WHERE email=${email}`;
  } else {
    getSqlite().prepare("UPDATE users SET role=? WHERE email=?").run(role, email);
  }
}

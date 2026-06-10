import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

let dbReady: Promise<void> | null = null;

async function initDb(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS scans (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      checked_at TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL,
      role TEXT DEFAULT 'user'
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS batches (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      total_urls INTEGER NOT NULL DEFAULT 0,
      indexed_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS batch_results (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      checked_at TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      ip TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0,
      last_reset TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;
  await sql`
    INSERT INTO settings (key, value)
    VALUES ('guest_mode', 'true'), ('public_signup', 'true')
    ON CONFLICT (key) DO NOTHING
  `;
}

function ensureDb(): Promise<void> {
  if (!dbReady) dbReady = initDb().catch((e) => { dbReady = null; throw e; });
  return dbReady;
}

// ─── Types ───────────────────────────────────────────────────────────────────
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

// ─── Guest Scan Helpers ──────────────────────────────────────────────────────
export async function saveScan(url: string, status: "INDEXED" | "NOT_INDEXED"): Promise<void> {
  await ensureDb();
  await sql`INSERT INTO scans (url, status, checked_at) VALUES (${url}, ${status}, ${new Date().toISOString()})`;
}

export async function getRecentScans(limit: number = 20): Promise<ScanRecord[]> {
  await ensureDb();
  return (await sql`SELECT * FROM scans ORDER BY id DESC LIMIT ${limit}`) as ScanRecord[];
}

export async function getCachedScan(url: string, maxAgeHours: number = 24): Promise<ScanRecord | null> {
  await ensureDb();
  const rows = await sql`SELECT * FROM scans WHERE url = ${url} ORDER BY id DESC LIMIT 1`;
  const row = rows[0] as ScanRecord | undefined;
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.checked_at).getTime();
  return ageMs <= maxAgeHours * 3_600_000 ? row : null;
}

// ─── User Helpers ─────────────────────────────────────────────────────────────
export async function createUser(email: string, passwordHash: string, name: string): Promise<User> {
  await ensureDb();
  const rows = await sql`
    INSERT INTO users (email, password_hash, name, plan, created_at)
    VALUES (${email}, ${passwordHash}, ${name}, 'free', ${new Date().toISOString()})
    RETURNING *
  `;
  return rows[0] as User;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureDb();
  const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
  return (rows[0] as User) ?? null;
}

export async function getUserById(id: number): Promise<User | null> {
  await ensureDb();
  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
  return (rows[0] as User) ?? null;
}

// ─── Batch Helpers ────────────────────────────────────────────────────────────
export async function createBatch(userId: number, totalUrls: number): Promise<Batch> {
  await ensureDb();
  const rows = await sql`
    INSERT INTO batches (user_id, total_urls, indexed_count, created_at)
    VALUES (${userId}, ${totalUrls}, 0, ${new Date().toISOString()})
    RETURNING *
  `;
  return rows[0] as Batch;
}

export async function saveBatchResult(batchId: number, url: string, status: string): Promise<void> {
  await ensureDb();
  await sql`INSERT INTO batch_results (batch_id, url, status, checked_at) VALUES (${batchId}, ${url}, ${status}, ${new Date().toISOString()})`;
  if (status === "INDEXED") {
    await sql`UPDATE batches SET indexed_count = indexed_count + 1 WHERE id = ${batchId}`;
  }
}

export async function getUserStats(userId: number) {
  await ensureDb();
  const [checkedRow, indexedRow, lastRows] = await Promise.all([
    sql`SELECT COALESCE(SUM(total_urls), 0) as total FROM batches WHERE user_id = ${userId}`,
    sql`SELECT COALESCE(SUM(indexed_count), 0) as total FROM batches WHERE user_id = ${userId}`,
    sql`SELECT * FROM batches WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`,
  ]);
  const totalChecked = Number(checkedRow[0]?.total ?? 0);
  const totalIndexed = Number(indexedRow[0]?.total ?? 0);
  const lastBatch = lastRows[0] as Batch | undefined;
  return {
    totalChecked,
    totalIndexed,
    avgIndexRate: totalChecked > 0 ? Math.round((totalIndexed / totalChecked) * 100) : 0,
    lastChecked: lastBatch?.created_at ?? null,
    lastBatchSize: lastBatch?.total_urls ?? 0,
  };
}

export async function getUserBatches(userId: number, limit: number = 20): Promise<Batch[]> {
  await ensureDb();
  return (await sql`SELECT * FROM batches WHERE user_id = ${userId} ORDER BY id DESC LIMIT ${limit}`) as Batch[];
}

export async function getBatchResults(batchId: number): Promise<BatchResult[]> {
  await ensureDb();
  return (await sql`SELECT * FROM batch_results WHERE batch_id = ${batchId} ORDER BY id ASC`) as BatchResult[];
}

// ─── IP Rate Limiting Helpers ────────────────────────────────────────────────
export async function getIpUsage(ip: string): Promise<{ count: number; last_reset: string }> {
  await ensureDb();
  const today = new Date().toDateString();
  const rows = await sql`SELECT count, last_reset FROM rate_limits WHERE ip = ${ip}`;
  const row = rows[0] as { count: number; last_reset: string } | undefined;
  if (!row || row.last_reset !== today) {
    await sql`
      INSERT INTO rate_limits (ip, count, last_reset) VALUES (${ip}, 0, ${today})
      ON CONFLICT (ip) DO UPDATE SET count = 0, last_reset = ${today}
    `;
    return { count: 0, last_reset: today };
  }
  return row;
}

export async function incrementIpUsage(ip: string, amount: number): Promise<void> {
  await ensureDb();
  const today = new Date().toDateString();
  await sql`UPDATE rate_limits SET count = count + ${amount}, last_reset = ${today} WHERE ip = ${ip}`;
}

// ─── Settings Helpers ────────────────────────────────────────────────────────
export async function getSetting(key: string, defaultValue: string): Promise<string> {
  await ensureDb();
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  return (rows[0] as { value: string } | undefined)?.value ?? defaultValue;
}

export async function updateSetting(key: string, value: string): Promise<void> {
  await ensureDb();
  await sql`INSERT INTO settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = ${value}`;
}

// ─── Admin Helpers ────────────────────────────────────────────────────────────
export async function getGlobalStats() {
  await ensureDb();
  const today = new Date().toDateString();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const [batchRow, scanRow, usersRow, guestRow, newUsersRow] = await Promise.all([
    sql`SELECT COALESCE(SUM(total_urls), 0) as total FROM batches`,
    sql`SELECT COUNT(*) as total FROM scans`,
    sql`SELECT COUNT(*) as total FROM users`,
    sql`SELECT COUNT(DISTINCT ip) as total FROM rate_limits WHERE last_reset = ${today}`,
    sql`SELECT COUNT(*) as total FROM users WHERE created_at >= ${sevenDaysAgo.toISOString()}`,
  ]);
  return {
    totalUrls: Number(batchRow[0]?.total ?? 0) + Number(scanRow[0]?.total ?? 0),
    totalUsers: Number(usersRow[0]?.total ?? 0),
    guestUsers24h: Number(guestRow[0]?.total ?? 0),
    newUsers7d: Number(newUsersRow[0]?.total ?? 0),
  };
}

export async function getAdminRecentChecks(limit: number = 20) {
  await ensureDb();
  return await sql`
    SELECT 'batch' as type, b.id, u.email, u.plan, b.total_urls, b.indexed_count, b.created_at
    FROM batches b JOIN users u ON b.user_id = u.id
    UNION ALL
    SELECT 'scan' as type, s.id, 'Guest User' as email, 'guest' as plan,
      1 as total_urls,
      CASE WHEN s.status = 'INDEXED' THEN 1 ELSE 0 END as indexed_count,
      s.checked_at as created_at
    FROM scans s
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function getAllUsers() {
  await ensureDb();
  return await sql`
    SELECT id, email, name, role, plan, created_at,
      (SELECT COALESCE(SUM(total_urls), 0) FROM batches WHERE user_id = users.id) as total_checks
    FROM users ORDER BY id DESC
  `;
}

export async function updatePremiumStatus(email: string, isPremium: boolean): Promise<void> {
  await ensureDb();
  await sql`UPDATE users SET plan = ${isPremium ? "premium" : "free"} WHERE email = ${email}`;
}

export async function setUserRole(email: string, role: string): Promise<void> {
  await ensureDb();
  await sql`UPDATE users SET role = ${role} WHERE email = ${email}`;
}

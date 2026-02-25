const Database = require('better-sqlite3');
const db = new Database('indexy.db');

try {
    const batchUrls = db.prepare('SELECT COALESCE(SUM(total_urls), 0) as total FROM batches').get().total;
    const scanUrls = db.prepare('SELECT COUNT(*) as total FROM scans').get().total;
    const stats = { totalUrls: batchUrls + scanUrls, totalUsers: db.prepare('SELECT COUNT(*) as total FROM users').get().total };

    const recent = db.prepare(`
        SELECT 'guest' as type, id, 'Guest User' as email, 'guest' as plan, 1 as total_urls, 1 as indexed_count, checked_at as created_at 
        FROM scans 
        UNION ALL 
        SELECT 'batch' as type, b.id, u.email, u.plan, b.total_urls, b.indexed_count, b.created_at 
        FROM batches b 
        JOIN users u ON b.user_id = u.id 
        ORDER BY created_at DESC 
        LIMIT 10
    `).all();

    console.log("STATS:", JSON.stringify(stats));
    console.log("RECENT_COUNT:", recent.length);
    console.log("FIRST_RECENT:", JSON.stringify(recent[0]));
} catch (err) {
    console.error("DEBUG ERROR:", err.message);
}

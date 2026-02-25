const Database = require('better-sqlite3');
const db = new Database('indexy.db');

try {
    const users = db.prepare("SELECT email, name, role, plan FROM users").all();
    console.log("USERS:", JSON.stringify(users, null, 2));

    const batchesCount = db.prepare("SELECT COUNT(*) as count FROM batches").get();
    console.log("BATCHES COUNT:", batchesCount.count);

    const scansCount = db.prepare("SELECT COUNT(*) as count FROM scans").get();
    console.log("SCANS COUNT:", scansCount.count);

    const settings = db.prepare("SELECT * FROM settings").all();
    console.log("SETTINGS:", JSON.stringify(settings, null, 2));

    const rateLimits = db.prepare("SELECT COUNT(*) as count FROM rate_limits").get();
    console.log("RATE LIMITS COUNT:", rateLimits.count);
} catch (err) {
    console.error("DB DEBUG ERROR:", err.message);
}

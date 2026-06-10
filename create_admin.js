// Run with: node create_admin.js
// Works locally (SQLite) and with Neon (if DATABASE_URL is set in .env.local)
require("dotenv").config({ path: ".env.local" });
const bcrypt = require("bcryptjs");

const email = "admin@indexy.test";
const password = "password123";
const name = "Admin User";

async function createAdmin() {
    const passwordHash = await bcrypt.hash(password, 12);

    if (process.env.DATABASE_URL) {
        const { neon } = require("@neondatabase/serverless");
        const sql = neon(process.env.DATABASE_URL);
        await sql`
            INSERT INTO users (email, password_hash, name, plan, role, created_at)
            VALUES (${email}, ${passwordHash}, ${name}, 'premium', 'admin', ${new Date().toISOString()})
            ON CONFLICT (email) DO UPDATE SET password_hash=${passwordHash}, role='admin', plan='premium'
        `;
    } else {
        const Database = require("better-sqlite3");
        const path = require("path");
        const db = new Database(path.join(__dirname, "indexy.db"));
        try {
            db.prepare("INSERT INTO users (email, password_hash, name, plan, role, created_at) VALUES (?, ?, ?, 'premium', 'admin', ?)").run(email, passwordHash, name, new Date().toISOString());
        } catch (err) {
            if (err.message.includes("UNIQUE")) {
                db.prepare("UPDATE users SET password_hash=?, role='admin', plan='premium' WHERE email=?").run(passwordHash, email);
            } else throw err;
        }
    }

    console.log("Admin created/updated!");
    console.log("Email:", email);
    console.log("Password:", password);
}

createAdmin().catch(console.error);

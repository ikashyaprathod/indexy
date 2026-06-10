// Run with: node create_admin.js
// Requires DATABASE_URL in .env.local
require("dotenv").config({ path: ".env.local" });
const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");

const sql = neon(process.env.DATABASE_URL);

async function createAdmin() {
    const email = "admin@indexy.test";
    const password = "password123";
    const name = "Admin User";
    const passwordHash = await bcrypt.hash(password, 12);

    try {
        await sql`
            INSERT INTO users (email, password_hash, name, plan, role, created_at)
            VALUES (${email}, ${passwordHash}, ${name}, 'premium', 'admin', ${new Date().toISOString()})
            ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}, role = 'admin', plan = 'premium'
        `;
        console.log("Admin user created/updated successfully!");
        console.log("Email:", email);
        console.log("Password:", password);
    } catch (err) {
        console.error("Error:", err.message);
    }
}

createAdmin();

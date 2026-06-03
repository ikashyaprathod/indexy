const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const db = new Database('indexy.db');

async function createAdmin() {
    const email = 'admin@indexy.test';
    const password = 'password123';
    const name = 'Admin User';
    const passwordHash = await bcrypt.hash(password, 12);

    try {
        db.prepare("INSERT INTO users (email, password_hash, name, plan, role, created_at) VALUES (?, ?, ?, 'premium', 'admin', ?)").run(
            email, passwordHash, name, new Date().toISOString()
        );
        console.log("Admin user created successfully!");
        console.log("Email:", email);
        console.log("Password:", password);
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            console.log("Admin user already exists. Updating password...");
            db.prepare("UPDATE users SET password_hash = ?, role = 'admin', plan = 'premium' WHERE email = ?").run(passwordHash, email);
            console.log("Admin user updated successfully!");
            console.log("Email:", email);
            console.log("Password:", password);
        } else {
            console.error("Error creating admin user:", err.message);
        }
    }
}

createAdmin();

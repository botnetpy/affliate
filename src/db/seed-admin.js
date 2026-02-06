require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function seedAdmin() {
    const email = 'admin@magmaprop.com';
    const password = 'admin123';

    try {
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            `INSERT INTO admins (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash = $2`,
            [email, hash]
        );
        console.log('Admin user seeded successfully');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        console.log('⚠️  Change the default password immediately!');
    } catch (err) {
        console.error('Error seeding admin:', err.message);
    } finally {
        await pool.end();
    }
}

seedAdmin();

-- Seed admin user
-- Default password: admin123 (change immediately after first login)
-- Hash generated with bcryptjs, 10 rounds
\c magmaprop_affiliate;

INSERT INTO admins (email, password_hash) 
VALUES ('admin@magmaprop.com', '$2a$10$8KzQn5QZG0Yf5Yx5Q5Lkx.9ZrZ5Yz5Yz5Yz5Yz5Yz5Yz5Yz5Yz5Y')
ON CONFLICT (email) DO NOTHING;

-- NOTE: The above hash is a placeholder. Run the following to generate a proper hash:
-- node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('admin123', 10).then(h => console.log(h))"
-- Then update the admin password_hash with the output.
-- Or use the seed script below after npm install:

-- To seed properly, run: node src/db/seed-admin.js

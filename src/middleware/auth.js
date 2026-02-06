const jwt = require('jsonwebtoken');
const pool = require('../config/database');

function authenticateToken(role) {
    return async (req, res, next) => {
        const token = req.cookies?.token;

        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (decoded.role !== role) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }

            if (role === 'affiliate') {
                const result = await pool.query('SELECT id, name, email, referral_code, wallet_address, status, total_referrals, created_at FROM affiliates WHERE id = $1', [decoded.id]);
                if (result.rows.length === 0) {
                    return res.status(401).json({ error: 'Account not found' });
                }
                if (result.rows[0].status !== 'approved') {
                    return res.status(403).json({ error: `Account is ${result.rows[0].status}` });
                }
                req.affiliate = result.rows[0];
            } else if (role === 'admin') {
                const result = await pool.query('SELECT id, email FROM admins WHERE id = $1', [decoded.id]);
                if (result.rows.length === 0) {
                    return res.status(401).json({ error: 'Account not found' });
                }
                req.admin = result.rows[0];
            }

            req.user = decoded;
            next();
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
            return res.status(401).json({ error: 'Invalid token' });
        }
    };
}

const authenticateAffiliate = authenticateToken('affiliate');
const authenticateAdmin = authenticateToken('admin');

module.exports = { authenticateAffiliate, authenticateAdmin };

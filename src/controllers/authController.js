const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');
const { REFERRAL_CODE_LENGTH } = require('../config/constants');

function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    const bytes = crypto.randomBytes(REFERRAL_CODE_LENGTH);
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
}

function setTokenCookie(res, token) {
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
}

async function affiliateRegister(req, res, next) {
    try {
        const { name, email, password, wallet_address } = req.body;

        const existing = await pool.query('SELECT id FROM affiliates WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        let referralCode;
        let codeExists = true;
        while (codeExists) {
            referralCode = generateReferralCode();
            const check = await pool.query('SELECT id FROM affiliates WHERE referral_code = $1', [referralCode]);
            codeExists = check.rows.length > 0;
        }

        const result = await pool.query(
            `INSERT INTO affiliates (name, email, password_hash, referral_code, wallet_address, status)
             VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id, name, email, referral_code, status, created_at`,
            [name, email, passwordHash, referralCode, wallet_address || null]
        );

        const affiliate = result.rows[0];

        res.status(201).json({
            message: 'Registration successful. Your account is pending approval.',
            affiliate: {
                id: affiliate.id,
                name: affiliate.name,
                email: affiliate.email,
                referral_code: affiliate.referral_code,
                status: affiliate.status
            }
        });
    } catch (err) {
        next(err);
    }
}

async function affiliateLogin(req, res, next) {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            'SELECT id, name, email, password_hash, referral_code, status FROM affiliates WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const affiliate = result.rows[0];
        const validPassword = await bcrypt.compare(password, affiliate.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (affiliate.status === 'rejected') {
            return res.status(403).json({ error: 'Your application has been rejected' });
        }

        if (affiliate.status === 'suspended') {
            return res.status(403).json({ error: 'Your account has been suspended' });
        }

        const token = jwt.sign(
            { id: affiliate.id, email: affiliate.email, role: 'affiliate' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        setTokenCookie(res, token);

        res.json({
            message: 'Login successful',
            affiliate: {
                id: affiliate.id,
                name: affiliate.name,
                email: affiliate.email,
                referral_code: affiliate.referral_code,
                status: affiliate.status
            }
        });
    } catch (err) {
        next(err);
    }
}

async function adminLogin(req, res, next) {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            'SELECT id, email, password_hash FROM admins WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const admin = result.rows[0];
        const validPassword = await bcrypt.compare(password, admin.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        setTokenCookie(res, token);

        res.json({
            message: 'Login successful',
            admin: { id: admin.id, email: admin.email }
        });
    } catch (err) {
        next(err);
    }
}

async function logout(req, res) {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
    });
    res.json({ message: 'Logged out successfully' });
}

module.exports = { affiliateRegister, affiliateLogin, adminLogin, logout };

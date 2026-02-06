const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../config/constants');

function getPagination(query) {
    let page = parseInt(query.page) || 1;
    let limit = parseInt(query.limit) || DEFAULT_PAGE_SIZE;
    if (page < 1) page = 1;
    if (limit < 1) limit = DEFAULT_PAGE_SIZE;
    if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

async function getDashboard(req, res, next) {
    try {
        const affiliateId = req.affiliate.id;

        const stats = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM clicks WHERE affiliate_id = $1) as total_clicks,
                (SELECT COUNT(*) FROM referrals WHERE affiliate_id = $1) as total_signups,
                (SELECT COUNT(*) FROM referrals WHERE affiliate_id = $1 AND status = 'paid') as paid_conversions,
                (SELECT COALESCE(SUM(commission_amount), 0) FROM referrals WHERE affiliate_id = $1 AND status = 'paid') as total_earnings,
                (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE affiliate_id = $1 AND status = 'completed') as total_paid_out,
                (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE affiliate_id = $1 AND status IN ('pending', 'processing')) as pending_payouts
        `, [affiliateId]);

        const row = stats.rows[0];
        const pendingEarnings = parseFloat(row.total_earnings) - parseFloat(row.total_paid_out) - parseFloat(row.pending_payouts);

        // Get performance data for the last 30 days
        const performance = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) FILTER (WHERE TRUE) as signups,
                COUNT(*) FILTER (WHERE status = 'paid') as conversions,
                COALESCE(SUM(commission_amount) FILTER (WHERE status = 'paid'), 0) as earnings
            FROM referrals
            WHERE affiliate_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [affiliateId]);

        const clicksPerDay = await pool.query(`
            SELECT DATE(created_at) as date, COUNT(*) as clicks
            FROM clicks
            WHERE affiliate_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [affiliateId]);

        res.json({
            stats: {
                total_clicks: parseInt(row.total_clicks),
                total_signups: parseInt(row.total_signups),
                paid_conversions: parseInt(row.paid_conversions),
                total_earnings: parseFloat(row.total_earnings),
                total_paid_out: parseFloat(row.total_paid_out),
                pending_earnings: pendingEarnings > 0 ? pendingEarnings : 0,
                conversion_rate: parseInt(row.total_clicks) > 0
                    ? ((parseInt(row.total_signups) / parseInt(row.total_clicks)) * 100).toFixed(2)
                    : '0.00'
            },
            performance: performance.rows,
            clicks_per_day: clicksPerDay.rows
        });
    } catch (err) {
        next(err);
    }
}

async function getReferrals(req, res, next) {
    try {
        const affiliateId = req.affiliate.id;
        const { page, limit, offset } = getPagination(req.query);
        const status = req.query.status;

        let query = 'SELECT * FROM referrals WHERE affiliate_id = $1';
        let countQuery = 'SELECT COUNT(*) FROM referrals WHERE affiliate_id = $1';
        const params = [affiliateId];
        const countParams = [affiliateId];

        if (status && ['signed_up', 'paid'].includes(status)) {
            query += ' AND status = $2';
            countQuery += ' AND status = $2';
            params.push(status);
            countParams.push(status);
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const [referrals, total] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, countParams)
        ]);

        res.json({
            referrals: referrals.rows,
            pagination: {
                page,
                limit,
                total: parseInt(total.rows[0].count),
                pages: Math.ceil(parseInt(total.rows[0].count) / limit)
            }
        });
    } catch (err) {
        next(err);
    }
}

async function getEarnings(req, res, next) {
    try {
        const affiliateId = req.affiliate.id;

        const earnings = await pool.query(`
            SELECT
                COALESCE(SUM(commission_amount), 0) as total_earned,
                COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) as from_conversions,
                COUNT(*) FILTER (WHERE status = 'paid') as paid_referrals,
                COALESCE(AVG(commission_amount) FILTER (WHERE status = 'paid'), 0) as avg_commission,
                COALESCE(MAX(commission_amount) FILTER (WHERE status = 'paid'), 0) as max_commission
            FROM referrals
            WHERE affiliate_id = $1 AND status = 'paid'
        `, [affiliateId]);

        const payouts = await pool.query(`
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) as total_paid_out,
                COALESCE(SUM(amount) FILTER (WHERE status IN ('pending', 'processing')), 0) as pending_payouts
            FROM payouts
            WHERE affiliate_id = $1
        `, [affiliateId]);

        const earningsRow = earnings.rows[0];
        const payoutsRow = payouts.rows[0];
        const available = parseFloat(earningsRow.total_earned) - parseFloat(payoutsRow.total_paid_out) - parseFloat(payoutsRow.pending_payouts);

        // Monthly earnings breakdown
        const monthly = await pool.query(`
            SELECT
                TO_CHAR(paid_at, 'YYYY-MM') as month,
                COUNT(*) as conversions,
                COALESCE(SUM(commission_amount), 0) as earnings
            FROM referrals
            WHERE affiliate_id = $1 AND status = 'paid'
            GROUP BY TO_CHAR(paid_at, 'YYYY-MM')
            ORDER BY month DESC
            LIMIT 12
        `, [affiliateId]);

        res.json({
            total_earned: parseFloat(earningsRow.total_earned),
            available_balance: available > 0 ? available : 0,
            total_paid_out: parseFloat(payoutsRow.total_paid_out),
            pending_payouts: parseFloat(payoutsRow.pending_payouts),
            paid_referrals: parseInt(earningsRow.paid_referrals),
            avg_commission: parseFloat(earningsRow.avg_commission),
            max_commission: parseFloat(earningsRow.max_commission),
            monthly_breakdown: monthly.rows
        });
    } catch (err) {
        next(err);
    }
}

async function getLink(req, res, next) {
    try {
        const siteUrl = process.env.SITE_URL || 'https://magmaprop.com';
        res.json({
            referral_code: req.affiliate.referral_code,
            referral_link: `${siteUrl}?ref=${req.affiliate.referral_code}`
        });
    } catch (err) {
        next(err);
    }
}

async function requestPayout(req, res, next) {
    const client = await pool.connect();
    try {
        const affiliateId = req.affiliate.id;
        const { amount } = req.body;

        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid payout amount' });
        }

        const walletAddress = req.affiliate.wallet_address;
        if (!walletAddress) {
            return res.status(400).json({ error: 'Please set your wallet address in profile settings first' });
        }

        await client.query('BEGIN');

        // Calculate available balance
        const earningsResult = await client.query(
            'SELECT COALESCE(SUM(commission_amount), 0) as total FROM referrals WHERE affiliate_id = $1 AND status = $2',
            [affiliateId, 'paid']
        );
        const payoutsResult = await client.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM payouts WHERE affiliate_id = $1 AND status IN ('pending', 'processing', 'completed')`,
            [affiliateId]
        );

        const available = parseFloat(earningsResult.rows[0].total) - parseFloat(payoutsResult.rows[0].total);

        if (parseFloat(amount) > available) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Insufficient balance',
                available_balance: available > 0 ? available : 0
            });
        }

        const result = await client.query(
            `INSERT INTO payouts (affiliate_id, amount, wallet_address, status, requested_at)
             VALUES ($1, $2, $3, 'pending', NOW()) RETURNING *`,
            [affiliateId, amount, walletAddress]
        );

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Payout request submitted',
            payout: result.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
}

async function getPayouts(req, res, next) {
    try {
        const affiliateId = req.affiliate.id;
        const { page, limit, offset } = getPagination(req.query);

        const [payouts, total] = await Promise.all([
            pool.query(
                'SELECT * FROM payouts WHERE affiliate_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
                [affiliateId, limit, offset]
            ),
            pool.query('SELECT COUNT(*) FROM payouts WHERE affiliate_id = $1', [affiliateId])
        ]);

        res.json({
            payouts: payouts.rows,
            pagination: {
                page,
                limit,
                total: parseInt(total.rows[0].count),
                pages: Math.ceil(parseInt(total.rows[0].count) / limit)
            }
        });
    } catch (err) {
        next(err);
    }
}

async function updateProfile(req, res, next) {
    try {
        const affiliateId = req.affiliate.id;
        const { name, email, wallet_address, current_password, new_password } = req.body;

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (name) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (email) {
            const existing = await pool.query('SELECT id FROM affiliates WHERE email = $1 AND id != $2', [email, affiliateId]);
            if (existing.rows.length > 0) {
                return res.status(409).json({ error: 'Email already in use' });
            }
            updates.push(`email = $${paramIndex++}`);
            params.push(email);
        }
        if (wallet_address !== undefined) {
            updates.push(`wallet_address = $${paramIndex++}`);
            params.push(wallet_address);
        }
        if (new_password) {
            if (!current_password) {
                return res.status(400).json({ error: 'Current password required to change password' });
            }
            const affiliate = await pool.query('SELECT password_hash FROM affiliates WHERE id = $1', [affiliateId]);
            const validPassword = await bcrypt.compare(current_password, affiliate.rows[0].password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }
            const hash = await bcrypt.hash(new_password, 10);
            updates.push(`password_hash = $${paramIndex++}`);
            params.push(hash);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(affiliateId);
        const result = await pool.query(
            `UPDATE affiliates SET ${updates.join(', ')} WHERE id = $${paramIndex}
             RETURNING id, name, email, referral_code, wallet_address, status, total_referrals, created_at`,
            params
        );

        res.json({
            message: 'Profile updated',
            affiliate: result.rows[0]
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getDashboard,
    getReferrals,
    getEarnings,
    getLink,
    requestPayout,
    getPayouts,
    updateProfile
};

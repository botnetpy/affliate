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
        const stats = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM affiliates) as total_affiliates,
                (SELECT COUNT(*) FROM affiliates WHERE status = 'pending') as pending_affiliates,
                (SELECT COUNT(*) FROM affiliates WHERE status = 'approved') as active_affiliates,
                (SELECT COUNT(*) FROM referrals) as total_referrals,
                (SELECT COUNT(*) FROM referrals WHERE status = 'paid') as paid_referrals,
                (SELECT COALESCE(SUM(payment_amount), 0) FROM referrals WHERE status = 'paid') as total_revenue,
                (SELECT COALESCE(SUM(commission_amount), 0) FROM referrals WHERE status = 'paid') as total_commissions,
                (SELECT COUNT(*) FROM payouts WHERE status = 'pending') as pending_payouts,
                (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE status = 'pending') as pending_payout_amount,
                (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE status = 'completed') as total_paid_out,
                (SELECT COUNT(*) FROM clicks) as total_clicks
        `);

        // Revenue & referrals over last 30 days
        const revenueOverTime = await pool.query(`
            SELECT
                DATE(paid_at) as date,
                COUNT(*) as referrals,
                COALESCE(SUM(payment_amount), 0) as revenue,
                COALESCE(SUM(commission_amount), 0) as commissions
            FROM referrals
            WHERE status = 'paid' AND paid_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(paid_at)
            ORDER BY date ASC
        `);

        // Top affiliates
        const topAffiliates = await pool.query(`
            SELECT
                a.id, a.name, a.email, a.referral_code,
                COUNT(r.id) FILTER (WHERE r.status = 'paid') as paid_referrals,
                COALESCE(SUM(r.commission_amount) FILTER (WHERE r.status = 'paid'), 0) as total_earnings
            FROM affiliates a
            LEFT JOIN referrals r ON r.affiliate_id = a.id
            WHERE a.status = 'approved'
            GROUP BY a.id
            ORDER BY total_earnings DESC
            LIMIT 10
        `);

        res.json({
            stats: stats.rows[0],
            revenue_over_time: revenueOverTime.rows,
            top_affiliates: topAffiliates.rows
        });
    } catch (err) {
        next(err);
    }
}

async function getAffiliates(req, res, next) {
    try {
        const { page, limit, offset } = getPagination(req.query);
        const { search, status } = req.query;

        let query = `
            SELECT a.*,
                COUNT(r.id) FILTER (WHERE r.status = 'paid') as paid_referrals,
                COALESCE(SUM(r.commission_amount) FILTER (WHERE r.status = 'paid'), 0) as total_earnings,
                (SELECT COUNT(*) FROM clicks WHERE affiliate_id = a.id) as total_clicks
            FROM affiliates a
            LEFT JOIN referrals r ON r.affiliate_id = a.id
        `;
        let countQuery = 'SELECT COUNT(*) FROM affiliates';
        const params = [];
        const countParams = [];
        const conditions = [];

        if (search) {
            conditions.push(`(a.name ILIKE $${params.length + 1} OR a.email ILIKE $${params.length + 1} OR a.referral_code ILIKE $${params.length + 1})`);
            params.push(`%${search}%`);
            countParams.push(`%${search}%`);
        }

        if (status && ['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
            conditions.push(`a.status = $${params.length + 1}`);
            params.push(status);
            countParams.push(status);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
            const countConditions = conditions.map((c, i) => c.replace(/a\./g, '').replace(/\$\d+/g, `$${i + 1}`));
            countQuery += ' WHERE ' + countConditions.join(' AND ');
        }

        query += ` GROUP BY a.id ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const [affiliates, total] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, countParams)
        ]);

        res.json({
            affiliates: affiliates.rows.map(a => {
                const { password_hash, ...rest } = a;
                return rest;
            }),
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

async function getAffiliateDetail(req, res, next) {
    try {
        const { id } = req.params;

        const affiliate = await pool.query(`
            SELECT a.*,
                COUNT(r.id) as total_referrals_count,
                COUNT(r.id) FILTER (WHERE r.status = 'paid') as paid_referrals,
                COALESCE(SUM(r.commission_amount) FILTER (WHERE r.status = 'paid'), 0) as total_earnings,
                COALESCE(SUM(r.payment_amount) FILTER (WHERE r.status = 'paid'), 0) as total_revenue_generated,
                (SELECT COUNT(*) FROM clicks WHERE affiliate_id = a.id) as total_clicks,
                (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE affiliate_id = a.id AND status = 'completed') as total_paid_out,
                (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE affiliate_id = a.id AND status IN ('pending', 'processing')) as pending_payouts
            FROM affiliates a
            LEFT JOIN referrals r ON r.affiliate_id = a.id
            WHERE a.id = $1
            GROUP BY a.id
        `, [id]);

        if (affiliate.rows.length === 0) {
            return res.status(404).json({ error: 'Affiliate not found' });
        }

        const referrals = await pool.query(
            'SELECT * FROM referrals WHERE affiliate_id = $1 ORDER BY created_at DESC LIMIT 50',
            [id]
        );

        const payouts = await pool.query(
            'SELECT * FROM payouts WHERE affiliate_id = $1 ORDER BY created_at DESC LIMIT 20',
            [id]
        );

        const { password_hash, ...affiliateData } = affiliate.rows[0];

        res.json({
            affiliate: affiliateData,
            referrals: referrals.rows,
            payouts: payouts.rows
        });
    } catch (err) {
        next(err);
    }
}

async function updateAffiliateStatus(req, res, next) {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const result = await pool.query(
            `UPDATE affiliates SET status = $1 WHERE id = $2
             RETURNING id, name, email, referral_code, status`,
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Affiliate not found' });
        }

        res.json({
            message: `Affiliate status updated to ${status}`,
            affiliate: result.rows[0]
        });
    } catch (err) {
        next(err);
    }
}

async function getAllReferrals(req, res, next) {
    try {
        const { page, limit, offset } = getPagination(req.query);
        const { status, affiliate_id } = req.query;

        let query = `
            SELECT r.*, a.name as affiliate_name, a.email as affiliate_email, a.referral_code
            FROM referrals r
            JOIN affiliates a ON a.id = r.affiliate_id
        `;
        let countQuery = 'SELECT COUNT(*) FROM referrals r';
        const params = [];
        const countParams = [];
        const conditions = [];

        if (status && ['signed_up', 'paid'].includes(status)) {
            conditions.push(`r.status = $${params.length + 1}`);
            params.push(status);
            countParams.push(status);
        }

        if (affiliate_id) {
            conditions.push(`r.affiliate_id = $${params.length + 1}`);
            params.push(affiliate_id);
            countParams.push(affiliate_id);
        }

        if (conditions.length > 0) {
            const where = ' WHERE ' + conditions.join(' AND ');
            query += where;
            countQuery += where;
        }

        query += ` ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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

async function getAllPayouts(req, res, next) {
    try {
        const { page, limit, offset } = getPagination(req.query);
        const { status } = req.query;

        let query = `
            SELECT p.*, a.name as affiliate_name, a.email as affiliate_email
            FROM payouts p
            JOIN affiliates a ON a.id = p.affiliate_id
        `;
        let countQuery = 'SELECT COUNT(*) FROM payouts';
        const params = [];
        const countParams = [];

        if (status && ['pending', 'processing', 'completed', 'failed'].includes(status)) {
            query += ' WHERE p.status = $1';
            countQuery += ' WHERE status = $1';
            params.push(status);
            countParams.push(status);
        }

        query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const [payouts, total] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, countParams)
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

async function processPayout(req, res, next) {
    try {
        const { id } = req.params;
        const { status, transaction_hash, notes } = req.body;

        if (!['processing', 'completed', 'failed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be processing, completed, or failed' });
        }

        const updates = ['status = $1'];
        const params = [status];
        let paramIndex = 2;

        if (transaction_hash) {
            updates.push(`transaction_hash = $${paramIndex++}`);
            params.push(transaction_hash);
        }
        if (notes) {
            updates.push(`notes = $${paramIndex++}`);
            params.push(notes);
        }
        if (status === 'completed' || status === 'failed') {
            updates.push(`processed_at = NOW()`);
        }

        params.push(id);
        const result = await pool.query(
            `UPDATE payouts SET ${updates.join(', ')} WHERE id = $${paramIndex}
             RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payout not found' });
        }

        res.json({
            message: `Payout ${status}`,
            payout: result.rows[0]
        });
    } catch (err) {
        next(err);
    }
}

async function getWebhookLogs(req, res, next) {
    try {
        const { page, limit, offset } = getPagination(req.query);
        const { event_type, status } = req.query;

        let query = 'SELECT * FROM webhook_logs';
        let countQuery = 'SELECT COUNT(*) FROM webhook_logs';
        const params = [];
        const countParams = [];
        const conditions = [];

        if (event_type) {
            conditions.push(`event_type = $${params.length + 1}`);
            params.push(event_type);
            countParams.push(event_type);
        }
        if (status) {
            conditions.push(`status = $${params.length + 1}`);
            params.push(status);
            countParams.push(status);
        }

        if (conditions.length > 0) {
            const where = ' WHERE ' + conditions.join(' AND ');
            query += where;
            countQuery += where;
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const [logs, total] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, countParams)
        ]);

        res.json({
            logs: logs.rows,
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

module.exports = {
    getDashboard,
    getAffiliates,
    getAffiliateDetail,
    updateAffiliateStatus,
    getAllReferrals,
    getAllPayouts,
    processPayout,
    getWebhookLogs
};

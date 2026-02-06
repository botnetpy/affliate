const pool = require('../config/database');
const { logWebhook } = require('../middleware/webhook');
const { COMMISSION_TIER_1_RATE, COMMISSION_TIER_2_RATE, COMMISSION_TIER_THRESHOLD } = require('../config/constants');

async function handleSignup(req, res, next) {
    const client = await pool.connect();
    try {
        const { ref_code, user_id, email, timestamp } = req.body;

        if (!ref_code || !user_id) {
            await logWebhook(req, 'failed', 'Missing required fields');
            return res.status(400).json({ error: 'Missing required fields: ref_code, user_id' });
        }

        // Find the affiliate
        const affiliateResult = await client.query(
            'SELECT id, status FROM affiliates WHERE referral_code = $1',
            [ref_code]
        );

        if (affiliateResult.rows.length === 0) {
            await logWebhook(req, 'failed', `Affiliate not found for code: ${ref_code}`);
            return res.status(404).json({ error: 'Affiliate not found' });
        }

        const affiliate = affiliateResult.rows[0];

        if (affiliate.status !== 'approved') {
            await logWebhook(req, 'failed', `Affiliate not approved: ${affiliate.status}`);
            return res.status(400).json({ error: 'Affiliate is not active' });
        }

        // Check if user already referred
        const existingRef = await client.query(
            'SELECT id FROM referrals WHERE referred_user_id = $1',
            [user_id]
        );

        if (existingRef.rows.length > 0) {
            await logWebhook(req, 'processed', 'User already referred');
            return res.json({ message: 'User already referred', duplicate: true });
        }

        // Create referral
        await client.query(
            `INSERT INTO referrals (affiliate_id, referred_user_id, referred_email, status, signed_up_at)
             VALUES ($1, $2, $3, 'signed_up', $4)`,
            [affiliate.id, user_id, email || null, timestamp ? new Date(timestamp) : new Date()]
        );

        // Update affiliate total_referrals count
        await client.query(
            'UPDATE affiliates SET total_referrals = total_referrals + 1 WHERE id = $1',
            [affiliate.id]
        );

        await logWebhook(req, 'processed');
        res.json({ message: 'Signup recorded successfully' });
    } catch (err) {
        await logWebhook(req, 'failed', err.message);
        next(err);
    } finally {
        client.release();
    }
}

async function handlePayment(req, res, next) {
    const client = await pool.connect();
    try {
        const { user_id, amount, currency, transaction_id, timestamp } = req.body;

        if (!user_id || !amount || !transaction_id) {
            await logWebhook(req, 'failed', 'Missing required fields');
            return res.status(400).json({ error: 'Missing required fields: user_id, amount, transaction_id' });
        }

        await client.query('BEGIN');

        // Find referral for this user
        const referralResult = await client.query(
            'SELECT id, affiliate_id, status FROM referrals WHERE referred_user_id = $1',
            [user_id]
        );

        if (referralResult.rows.length === 0) {
            await client.query('COMMIT');
            await logWebhook(req, 'processed', 'No referral found for user');
            return res.json({ message: 'No referral found for this user', commission: false });
        }

        const referral = referralResult.rows[0];

        // One-time commission: only on first payment
        if (referral.status === 'paid') {
            await client.query('COMMIT');
            await logWebhook(req, 'processed', 'Commission already awarded');
            return res.json({ message: 'Commission already awarded for this user', commission: false });
        }

        // Count affiliate's paid referrals to determine commission rate
        const paidCountResult = await client.query(
            'SELECT COUNT(*) as count FROM referrals WHERE affiliate_id = $1 AND status = $2',
            [referral.affiliate_id, 'paid']
        );
        const paidCount = parseInt(paidCountResult.rows[0].count);

        // Determine commission rate based on number of paid referrals
        const commissionRate = paidCount < COMMISSION_TIER_THRESHOLD
            ? COMMISSION_TIER_1_RATE
            : COMMISSION_TIER_2_RATE;

        const commissionAmount = parseFloat(amount) * commissionRate;

        // Update referral with payment details
        await client.query(
            `UPDATE referrals SET
                status = 'paid',
                payment_amount = $1,
                commission_amount = $2,
                commission_rate = $3,
                currency = $4,
                transaction_id = $5,
                paid_at = $6
             WHERE id = $7`,
            [amount, commissionAmount, commissionRate * 100, currency || 'USDT', transaction_id, timestamp ? new Date(timestamp) : new Date(), referral.id]
        );

        await client.query('COMMIT');

        await logWebhook(req, 'processed');
        res.json({
            message: 'Payment recorded, commission calculated',
            commission: true,
            commission_amount: commissionAmount,
            commission_rate: `${commissionRate * 100}%`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        await logWebhook(req, 'failed', err.message);
        next(err);
    } finally {
        client.release();
    }
}

module.exports = { handleSignup, handlePayment };

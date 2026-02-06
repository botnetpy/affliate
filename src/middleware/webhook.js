const crypto = require('crypto');
const pool = require('../config/database');

function verifyWebhookSignature(req, res, next) {
    const signature = req.headers['x-webhook-signature'];
    const secret = process.env.WEBHOOK_SECRET;

    if (!signature) {
        logWebhook(req, 'failed', 'Missing signature');
        return res.status(401).json({ error: 'Missing webhook signature' });
    }

    if (!secret) {
        console.error('WEBHOOK_SECRET not configured');
        logWebhook(req, 'failed', 'Server misconfigured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );

    if (!isValid) {
        logWebhook(req, 'failed', 'Invalid signature');
        return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    next();
}

async function logWebhook(req, status, errorMessage = null) {
    try {
        const eventType = req.path.split('/').pop();
        const ip = req.ip || req.connection.remoteAddress;
        await pool.query(
            `INSERT INTO webhook_logs (event_type, payload, ip_address, status, error_message) VALUES ($1, $2, $3, $4, $5)`,
            [eventType, JSON.stringify(req.body), ip, status, errorMessage]
        );
    } catch (err) {
        console.error('Error logging webhook:', err.message);
    }
}

module.exports = { verifyWebhookSignature, logWebhook };

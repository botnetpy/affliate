require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const webhookRoutes = require('./routes/webhooks');
const affiliateRoutes = require('./routes/affiliate');
const adminRoutes = require('./routes/admin');
const errorHandler = require('./middleware/errorHandler');
const pool = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Railway, Fly.io, etc.)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"]
        }
    }
}));

// CORS
app.use(cors({
    origin: true,
    credentials: true
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting for webhook endpoints
const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,
    message: { error: 'Too many webhook requests' }
});

// Static files
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.use('/affiliate', express.static(path.join(__dirname, '../public/affiliate')));

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/webhooks', webhookLimiter, webhookRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database connection failed' });
    }
});

// Click tracking endpoint (called from the main site)
app.get('/api/track/click', async (req, res) => {
    try {
        const { ref } = req.query;
        if (!ref) return res.status(400).json({ error: 'Missing ref code' });

        const affiliate = await pool.query(
            'SELECT id FROM affiliates WHERE referral_code = $1 AND status = $2',
            [ref, 'approved']
        );

        if (affiliate.rows.length > 0) {
            await pool.query(
                'INSERT INTO clicks (affiliate_id, ip_address, user_agent, referrer_url) VALUES ($1, $2, $3, $4)',
                [affiliate.rows[0].id, req.ip, req.headers['user-agent'], req.headers['referer'] || null]
            );
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('Click tracking error:', err.message);
        res.json({ ok: true }); // Don't expose errors
    }
});

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/affiliate/');
});

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    console.log(`MagmaProp Affiliate System running on port ${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin/`);
    console.log(`Affiliate dashboard: http://localhost:${PORT}/affiliate/`);
});

module.exports = app;

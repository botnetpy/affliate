const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticateAffiliate } = require('../middleware/auth');
const {
    getDashboard,
    getReferrals,
    getEarnings,
    getLink,
    requestPayout,
    getPayouts,
    updateProfile
} = require('../controllers/affiliateController');

const router = express.Router();

// All routes require affiliate authentication
router.use(authenticateAffiliate);

router.get('/dashboard', getDashboard);
router.get('/referrals', getReferrals);
router.get('/earnings', getEarnings);
router.get('/link', getLink);

router.post('/payout/request', [
    body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount is required'),
    validate
], requestPayout);

router.get('/payouts', getPayouts);

router.put('/profile', [
    body('name').optional().trim().notEmpty().isLength({ max: 255 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('wallet_address').optional().trim().isLength({ max: 255 }),
    body('new_password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    validate
], updateProfile);

module.exports = router;

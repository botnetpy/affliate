const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticateAdmin } = require('../middleware/auth');
const {
    getDashboard,
    getAffiliates,
    getAffiliateDetail,
    updateAffiliateStatus,
    getAllReferrals,
    getAllPayouts,
    processPayout,
    getWebhookLogs
} = require('../controllers/adminController');

const router = express.Router();

// All routes require admin authentication
router.use(authenticateAdmin);

router.get('/dashboard', getDashboard);
router.get('/affiliates', getAffiliates);
router.get('/affiliates/:id', getAffiliateDetail);

router.put('/affiliates/:id/status', [
    body('status').isIn(['pending', 'approved', 'rejected', 'suspended']).withMessage('Invalid status'),
    validate
], updateAffiliateStatus);

router.get('/referrals', getAllReferrals);
router.get('/payouts', getAllPayouts);

router.put('/payouts/:id', [
    body('status').isIn(['processing', 'completed', 'failed']).withMessage('Invalid status'),
    body('transaction_hash').optional().trim(),
    body('notes').optional().trim(),
    validate
], processPayout);

router.get('/webhooks/logs', getWebhookLogs);

module.exports = router;

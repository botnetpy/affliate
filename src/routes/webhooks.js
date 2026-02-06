const express = require('express');
const { verifyWebhookSignature } = require('../middleware/webhook');
const { handleSignup, handlePayment } = require('../controllers/webhookController');

const router = express.Router();

router.post('/signup', verifyWebhookSignature, handleSignup);
router.post('/payment', verifyWebhookSignature, handlePayment);

module.exports = router;

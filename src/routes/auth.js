const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { affiliateRegister, affiliateLogin, adminLogin, logout } = require('../controllers/authController');

const router = express.Router();

router.post('/affiliate/register', [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 255 }),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('wallet_address').optional().trim().isLength({ max: 255 }),
    validate
], affiliateRegister);

router.post('/affiliate/login', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate
], affiliateLogin);

router.post('/admin/login', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate
], adminLogin);

router.post('/logout', logout);

module.exports = router;

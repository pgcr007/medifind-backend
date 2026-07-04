const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { register, login, updateFcmToken, getProfile, updateProfile } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.put('/fcm-token', authenticate, updateFcmToken);
router.get('/me', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);

module.exports = router;
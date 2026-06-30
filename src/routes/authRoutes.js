const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { register, login, updateFcmToken } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.put('/fcm-token', authenticate, updateFcmToken);

module.exports = router;
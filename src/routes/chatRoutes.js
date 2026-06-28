const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { chat } = require('../controllers/chatController');

router.post('/', authenticate, chat);

module.exports = router;
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { createReservation, getMyReservations } = require('../controllers/reservationController');

router.post('/', authenticate, createReservation);
router.get('/me', authenticate, getMyReservations);

module.exports = router;
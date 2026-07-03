const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { createReservation, getMyReservations, getPharmacyReservations, updateReservationStatus } = require('../controllers/reservationController');

router.post('/', authenticate, createReservation);
router.get('/me', authenticate, getMyReservations);
router.get('/pharmacy/:pharmacyId', authenticate, authorize('pharmacy'), getPharmacyReservations);
router.put('/:id/status', authenticate, authorize('pharmacy'), updateReservationStatus);

module.exports = router;
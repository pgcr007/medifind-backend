const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  upsertReview,
  getPharmacyReviews,
  getMyReviewForPharmacy,
  replyToReview,
  deleteReview
} = require('../controllers/reviewController');

router.post('/', authenticate, authorize('user'), upsertReview);
router.get('/pharmacy/:pharmacyId', getPharmacyReviews);
router.get('/pharmacy/:pharmacyId/mine', authenticate, authorize('user'), getMyReviewForPharmacy);
router.put('/:id/reply', authenticate, authorize('pharmacy'), replyToReview);
router.delete('/:id', authenticate, authorize('user'), deleteReview);

module.exports = router;
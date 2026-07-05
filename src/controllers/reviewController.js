const Review = require('../models/Review');
const Pharmacy = require('../models/Pharmacy');

// Recalculates and persists averageRating/reviewCount on the Pharmacy doc.
// Called after every create, update, or delete so the cached numbers never drift.
async function recalculatePharmacyRating(pharmacyId) {
  const stats = await Review.aggregate([
    { $match: { pharmacyId: new (require('mongoose').Types.ObjectId)(pharmacyId) } },
    { $group: { _id: '$pharmacyId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);

  const avgRating = stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0;
  const count = stats.length > 0 ? stats[0].count : 0;

  await Pharmacy.findByIdAndUpdate(pharmacyId, {
    averageRating: avgRating,
    reviewCount: count
  });
}

// Create or update the logged-in user's review for a pharmacy (one per user per pharmacy)
async function upsertReview(req, res) {
  try {
    const { pharmacyId, rating, comment } = req.body;

    if (!pharmacyId || !rating) {
      return res.status(400).json({ error: 'pharmacyId and rating are required' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' });
    }

    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });

    const review = await Review.findOneAndUpdate(
      { pharmacyId, userId: req.user.id },
      { rating, comment: comment || '' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('userId', 'name');

    await recalculatePharmacyRating(pharmacyId);

    res.status(200).json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Public list of all reviews for a pharmacy, most recent first
async function getPharmacyReviews(req, res) {
  try {
    const { pharmacyId } = req.params;

    const reviews = await Review.find({ pharmacyId })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Fetch the logged-in user's own review for a pharmacy, so the app can
// pre-fill the form as an "edit" instead of a fresh "create"
async function getMyReviewForPharmacy(req, res) {
  try {
    const { pharmacyId } = req.params;

    const review = await Review.findOne({ pharmacyId, userId: req.user.id });
    res.json(review || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Pharmacy owner replies to a review left on their own pharmacy
async function replyToReview(req, res) {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Reply text is required' });
    }

    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const pharmacy = await Pharmacy.findById(review.pharmacyId);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });

    if (pharmacy.ownerUserId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this pharmacy' });
    }

    review.ownerReply = { text: text.trim(), repliedAt: new Date() };
    await review.save();

    res.json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// User deletes their own review
async function deleteReview(req, res) {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    if (review.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this review' });
    }

    const { pharmacyId } = review;
    await review.deleteOne();
    await recalculatePharmacyRating(pharmacyId);

    res.json({ message: 'Review deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  upsertReview,
  getPharmacyReviews,
  getMyReviewForPharmacy,
  replyToReview,
  deleteReview
};
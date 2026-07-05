const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },
  ownerReply: {
    text: { type: String },
    repliedAt: { type: Date }
  }
}, { timestamps: true });

// Enforces one review per user per pharmacy at the database level
reviewSchema.index({ pharmacyId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
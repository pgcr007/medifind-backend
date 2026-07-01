const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    localImageId: {
      type: String,
      required: true, // UUID matching the on-device image filename
    },
    extractedText: {
      type: String,
      default: '',
    },
    medicines: {
      type: [String],
      default: [],
    },
    doctorName: {
      type: String,
      default: '',
    },
    prescriptionDate: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Prescription', prescriptionSchema);
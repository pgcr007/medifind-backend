const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  genericName: { type: String },
  category: { type: String },
  barcode: { type: String }, // optional — existing medicines without one are unaffected
  alternatives: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Medicine', medicineSchema);
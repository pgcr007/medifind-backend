const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  genericName: { type: String },
  category: { type: String },
  alternatives: [{ type: String }] // names of other medicines with the same generic composition
}, { timestamps: true });

module.exports = mongoose.model('Medicine', medicineSchema);
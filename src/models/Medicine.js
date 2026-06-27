const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
    name: { type: String, required: true },
    genericName: { type: String },
    category: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Medicine', medicineSchema);
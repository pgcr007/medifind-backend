const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  stockQty: { type: Number, required: true, default: 0 },
  price: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Inventory', inventorySchema);
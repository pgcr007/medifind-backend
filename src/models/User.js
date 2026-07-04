const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'pharmacy', 'admin'], default: 'user' },
  fcmToken: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  phone: { type: String, default: null },
  address: { type: String, default: null },
  dob: { type: Date, default: null },
  // Base64-encoded compressed JPEG/PNG, small thumbnail only (~50-100KB target).
  // Stored inline since this is one small field per user, unlike prescription
  // images which are many-per-user and stay device-local for that reason.
  profilePicture: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function register(req, res) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    // SECURITY: reject non-string values outright. Without this, a body like
    // { "email": { "$gt": "" }, "password": "x" } would be passed straight
    // into a Mongoose query as a query operator instead of a literal value.
    if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
      return res.status(400).json({ error: 'name, email, and password must be strings' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // SECURITY: never trust a client-supplied 'admin' role here. Self-registration
    // may legitimately request 'pharmacy' (that's how pharmacy owners sign up),
    // but 'admin' can only be granted by an existing admin via
    // PUT /api/admin/users/:id/role — anything else falls back to 'user'.
    const allowedSelfSignupRoles = ['user', 'pharmacy'];
    const safeRole = allowedSelfSignupRoles.includes(role) ? role : 'user';

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: safeRole
    });

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // SECURITY: same guard as register — reject non-string email/password
    // before they can reach a Mongoose query as an operator object.
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email and password must be strings' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ error: 'This account has been disabled.' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateFcmToken(req, res) {
  try {
    const { fcmToken } = req.body;
    await User.findByIdAndUpdate(req.user.id, { fcmToken });
    res.json({ message: 'FCM token updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash -fcmToken');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateProfile(req, res) {
  try {
    const { name, phone, address, dob, profilePicture } = req.body;

    // Only touch fields that were actually sent, so a partial update
    // (e.g. just the picture) doesn't null out the others.
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (address !== undefined) updates.address = address;
    if (dob !== undefined) updates.dob = dob;
    if (profilePicture !== undefined) updates.profilePicture = profilePicture;

    // Rough safety cap on the incoming base64 string so a full-resolution
    // photo can't slip through and eat into the Atlas free-tier storage cap.
    if (profilePicture && profilePicture.length > 300_000) {
      return res.status(413).json({ error: 'Profile picture is too large. Please use a smaller image.' });
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true })
      .select('-passwordHash -fcmToken');

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { register, login, updateFcmToken, getProfile, updateProfile };
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { authLimiter, apiLimiter } = require('./src/middleware/rateLimiter');

const authRoutes = require('./src/routes/authRoutes');
const pharmacyRoutes = require('./src/routes/pharmacyRoutes');
const medicineRoutes = require('./src/routes/medicineRoutes');
const inventoryRoutes = require('./src/routes/inventoryRoutes');
const reservationRoutes = require('./src/routes/reservationRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const reminderRoutes = require('./src/routes/reminderRoutes');
const prescriptionRoutes = require('./src/routes/prescriptionRoutes');
const reviewRoutes = require('./src/routes/reviewRoutes');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Intentionally NOT rate-limited -- a free uptime pinger needs to hit this
// on a schedule to keep the Render free-tier service from cold-sleeping.
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// General abuse protection across the whole API...
app.use('/api', apiLimiter);

// ...with an additional, stricter limit specifically on auth endpoints
// (login/register), since those are the most valuable brute-force target.
app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/pharmacies', pharmacyRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/reviews', reviewRoutes);

module.exports = app;
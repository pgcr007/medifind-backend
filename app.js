require('dotenv').config();
const express = require('express');
const cors = require('cors');

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
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
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
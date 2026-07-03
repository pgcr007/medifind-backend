require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');

const authRoutes = require('./src/routes/authRoutes');
const pharmacyRoutes = require('./src/routes/pharmacyRoutes');
const medicineRoutes = require('./src/routes/medicineRoutes');
const inventoryRoutes = require('./src/routes/inventoryRoutes');
const reservationRoutes = require('./src/routes/reservationRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const reminderRoutes = require('./src/routes/reminderRoutes');
const { startRefillCheckJob } = require('./src/jobs/refillCheckJob');
const prescriptionRoutes = require('./src/routes/prescriptionRoutes');


const app = express();
app.use(cors());
app.use(express.json());

connectDB();
startRefillCheckJob();

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
app.use('/api/admin', require('./routes/adminRoutes'));


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());
const connectDB = require('./src/config/db');

connectDB();

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
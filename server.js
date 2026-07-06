require('dotenv').config();
const connectDB = require('./src/config/db');
const { startRefillCheckJob } = require('./src/jobs/refillCheckJob');
const app = require('./app');

connectDB();
startRefillCheckJob();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
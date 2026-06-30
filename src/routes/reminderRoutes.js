const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  createReminder,
  getMyReminders,
  updateReminder,
  deleteReminder
} = require('../controllers/reminderController');

router.post('/', authenticate, createReminder);
router.get('/', authenticate, getMyReminders);
router.put('/:id', authenticate, updateReminder);
router.delete('/:id', authenticate, deleteReminder);

module.exports = router;
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  createPrescription,
  getPrescriptions,
  getPrescriptionById,
  updatePrescription,
  deletePrescription,
} = require('../controllers/prescriptionController');

router.use(authenticate);

router.route('/')
  .post(createPrescription)
  .get(getPrescriptions);

router.route('/:id')
  .get(getPrescriptionById)
  .put(updatePrescription)
  .delete(deletePrescription);

module.exports = router;
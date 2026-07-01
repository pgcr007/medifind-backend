const Prescription = require('../models/Prescription');

// @desc    Create a new prescription vault entry
// @route   POST /api/prescriptions
// @access  Private
exports.createPrescription = async (req, res) => {
  try {
    const { localImageId, extractedText, medicines, doctorName, prescriptionDate, notes } = req.body;

    if (!localImageId) {
      return res.status(400).json({ success: false, message: 'localImageId is required' });
    }

    const prescription = await Prescription.create({
      userId: req.user.id,
      localImageId,
      extractedText,
      medicines,
      doctorName,
      prescriptionDate,
      notes,
    });

    res.status(201).json({ success: true, data: prescription });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all prescriptions for logged-in user
// @route   GET /api/prescriptions
// @access  Private
exports.getPrescriptions = async (req, res) => {
  try {
    const prescriptions = await Prescription.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: prescriptions.length, data: prescriptions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single prescription by ID
// @route   GET /api/prescriptions/:id
// @access  Private
exports.getPrescriptionById = async (req, res) => {
  try {
    const prescription = await Prescription.findOne({ _id: req.params.id, userId: req.user.id });

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    res.status(200).json({ success: true, data: prescription });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a prescription
// @route   PUT /api/prescriptions/:id
// @access  Private
exports.updatePrescription = async (req, res) => {
  try {
    const prescription = await Prescription.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    res.status(200).json({ success: true, data: prescription });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a prescription
// @route   DELETE /api/prescriptions/:id
// @access  Private
exports.deletePrescription = async (req, res) => {
  try {
    const prescription = await Prescription.findOneAndDelete({ _id: req.params.id, userId: req.user.id });

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    res.status(200).json({ success: true, message: 'Prescription deleted', data: { id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
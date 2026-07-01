const Prescription = require('../models/Prescription');

exports.createPrescription = async (req, res) => {
  try {
    const { localImageId, extractedText, medicines, doctorName, prescriptionDate, notes } = req.body;

    if (!localImageId) {
      return res.status(400).json({ message: 'localImageId is required' });
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

    res.status(201).json(prescription);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPrescriptions = async (req, res) => {
  try {
    const prescriptions = await Prescription.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json(prescriptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPrescriptionById = async (req, res) => {
  try {
    const prescription = await Prescription.findOne({ _id: req.params.id, userId: req.user.id });
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }
    res.status(200).json(prescription);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updatePrescription = async (req, res) => {
  try {
    const prescription = await Prescription.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }
    res.status(200).json(prescription);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deletePrescription = async (req, res) => {
  try {
    const prescription = await Prescription.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }
    res.status(200).json({ message: 'Prescription deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
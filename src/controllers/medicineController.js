const Medicine = require('../models/Medicine');

function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

async function searchMedicines(req, res) {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ error: 'name query parameter is required' });
    }

    const exactMatches = await Medicine.find({
      name: { $regex: name, $options: 'i' }
    }).limit(20);

    if (exactMatches.length > 0) {
      return res.json(exactMatches);
    }

    const allMedicines = await Medicine.find({}).select('name genericName category').limit(2000);
    const threshold = name.length <= 5 ? 2 : 3;
    const scored = allMedicines
      .map(med => ({ med, distance: levenshtein(name, med.name) }))
      .filter(({ distance }) => distance <= threshold)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10)
      .map(({ med }) => med);

    res.json(scored);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getMedicineByBarcode(req, res) {
  try {
    const { code } = req.params;
    const medicine = await Medicine.findOne({ barcode: code });
    if (!medicine) {
      return res.status(404).json({ error: 'No medicine found for this barcode' });
    }
    res.json(medicine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createMedicine(req, res) {
  try {
    const { name, genericName, category, barcode } = req.body;
    const medicine = await Medicine.create({ name, genericName, category, barcode });
    res.status(201).json(medicine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAlternatives(req, res) {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });

    if (!medicine.genericName) {
      return res.json({ alternatives: [] });
    }

    const alternatives = await Medicine.find({
      genericName: medicine.genericName,
      _id: { $ne: medicine._id }
    }).limit(5);

    res.json({ alternatives });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { searchMedicines, createMedicine, getAlternatives, getMedicineByBarcode };
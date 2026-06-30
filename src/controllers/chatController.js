const { GoogleGenerativeAI } = require('@google/generative-ai');
const Medicine = require('../models/Medicine');
const Pharmacy = require('../models/Pharmacy');
const Inventory = require('../models/Inventory');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const INTENT_PROMPT = `You are an intent classifier for a medicine-finder app called MediFind AI.
Given the user's message, respond with ONLY a JSON object, no other text, no markdown.

If the user is asking to find/locate/check availability of a specific medicine, respond:
{"intent":"search_medicine","medicineName":"<extracted medicine name>"}

For anything else (general questions, greetings, dosage questions, side effects, etc.), respond:
{"intent":"general"}

User message: `;

const SYSTEM_CONTEXT = `You are a helpful assistant inside MediFind AI, a medicine availability app.
You can answer general questions about medicines, dosage reminders, side effects (informational only),
and how to use the app. You are NOT a doctor. For any specific medical advice, dosage changes, or
diagnosis questions, always tell the user to consult a licensed doctor or pharmacist. Keep answers
concise and easy to understand for a general audience.`;

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function chat(req, res) {
  try {
    const { message, lat, lng } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    // Step 1: classify intent
    const intentResult = await model.generateContent(INTENT_PROMPT + message);
    let intentText = intentResult.response.text().trim();
    intentText = intentText.replace(/```json|```/g, '').trim();

    let parsedIntent;
    try {
      parsedIntent = JSON.parse(intentText);
    } catch {
      parsedIntent = { intent: 'general' };
    }

    if (parsedIntent.intent === 'search_medicine' && parsedIntent.medicineName) {
      const medicines = await Medicine.find({
        name: { $regex: parsedIntent.medicineName, $options: 'i' }
      }).limit(5);

      if (medicines.length === 0) {
        const reply = `I couldn't find "${parsedIntent.medicineName}" in our catalog. Could you check the spelling, or try a different medicine name?`;
        return res.json({ reply, searchResults: null });
      }

      const medicineIds = medicines.map(m => m._id);
      const inventoryEntries = await Inventory.find({
        medicineId: { $in: medicineIds },
        stockQty: { $gt: 0 }
      });

      const pharmacyIds = [...new Set(inventoryEntries.map(e => e.pharmacyId.toString()))];
      const pharmacies = await Pharmacy.find({ _id: { $in: pharmacyIds }, verified: true });

      let resultsSummary = [];
      if (lat && lng) {
        resultsSummary = pharmacies.map(p => {
          const entry = inventoryEntries.find(e => e.pharmacyId.toString() === p._id.toString());
          return {
            pharmacyName: p.name,
            address: p.address,
            stockQty: entry ? entry.stockQty : 0,
            price: entry ? entry.price : null,
            distanceKm: distanceKm(parseFloat(lat), parseFloat(lng), p.latitude, p.longitude)
          };
        }).sort((a, b) => a.distanceKm - b.distanceKm);
      } else {
        resultsSummary = pharmacies.map(p => ({ pharmacyName: p.name, address: p.address }));
      }

      const summaryPrompt = `${SYSTEM_CONTEXT}\n\nThe user asked: "${message}"\nHere are the real search results found: ${JSON.stringify(resultsSummary)}\nWrite a brief, friendly reply (2-3 sentences) summarizing where they can find this medicine, mentioning the closest or first result by name. Do not invent any details not present in the data.`;

      const replyResult = await model.generateContent(summaryPrompt);
      const reply = replyResult.response.text();

      return res.json({
        reply,
        searchResults: {
          medicineId: medicines[0]._id,
          medicineName: medicines[0].name,
          pharmacies: resultsSummary
        }
      });
    }

    // General conversation fallback
    const generalResult = await model.generateContent(`${SYSTEM_CONTEXT}\n\nUser question: ${message}`);
    const reply = generalResult.response.text();
    res.json({ reply, searchResults: null });

  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ error: 'Chatbot is currently unavailable. Please try again later.' });
  }
}

module.exports = { chat };
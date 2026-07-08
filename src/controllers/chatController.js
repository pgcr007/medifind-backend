const { GoogleGenerativeAI } = require('@google/generative-ai');
const Medicine = require('../models/Medicine');
const Pharmacy = require('../models/Pharmacy');
const Inventory = require('../models/Inventory');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_CONTEXT = `You are a helpful assistant inside MediFind AI, a medicine availability app.
You can answer general questions about medicines, dosage reminders, side effects (informational only),
and how to use the app. You are NOT a doctor. For any specific medical advice, dosage changes, or
diagnosis questions, always tell the user to consult a licensed doctor or pharmacist. Keep answers
concise and easy to understand for a general audience.`;

// --- Local, non-Gemini intent classification ---------------------------
// Avoids burning a Gemini call just to detect intent, since the free tier
// only allows 20 requests/day per model. This is a best-effort heuristic,
// not as accurate as an LLM classifier, but it roughly doubles how many
// real messages we can afford to send to Gemini per day.
const SEARCH_TRIGGERS = [
  /do you have\s+(.+)/i,
  /where can i find\s+(.+)/i,
  /where.*(can i )?find\s+(.+)/i,
  /is\s+(.+?)\s+available/i,
  /find\s+(.+?)\s+(near|nearby|close)/i,
  /looking for\s+(.+)/i,
  /need\s+(.+?)\s+(urgently|now|asap)/i,
  /can i (get|buy)\s+(.+)/i,
  /stock of\s+(.+)/i,
];

const TRAILING_NOISE = /\b(near me|nearby|close by|urgently|now|asap|please|today)\b/gi;

function classifyIntentLocally(message) {
  for (const pattern of SEARCH_TRIGGERS) {
    const match = message.match(pattern);
    if (match) {
      // Take the last non-empty capturing group as the medicine name guess.
      const candidate = match.slice(1).reverse().find(g => g && g.trim().length > 0);
      if (candidate) {
        const medicineName = candidate.replace(TRAILING_NOISE, '').replace(/[?.!]+$/, '').trim();
        if (medicineName.length > 0) {
          return { intent: 'search_medicine', medicineName };
        }
      }
    }
  }
  return { intent: 'general' };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function is503(err) {
  return err.message && err.message.includes('503');
}

function isQuotaError(err) {
  return err.message && err.message.includes('429');
}

async function callWithRetry(model, prompt) {
  const maxRetries = 3;
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      lastError = err;
      // Quota errors won't resolve by retrying the same model — bail out
      // immediately so the caller can try the fallback model instead.
      if (isQuotaError(err)) throw err;
      if (!is503(err)) throw err;
      const delayMs = 500 * Math.pow(2, attempt);
      console.log(`Gemini 503, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

// Tries the primary model (with retries on 503), then falls back to a
// secondary model on either exhausted retries or a quota/429 error.
async function generateWithFallback(prompt) {
  const primaryModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  try {
    return await callWithRetry(primaryModel, prompt);
  } catch (primaryErr) {
    try {
      console.log('Primary model unavailable, trying fallback model');
      return await fallbackModel.generateContent(prompt);
    } catch (fallbackErr) {
      throw primaryErr; // report the original, more informative error
    }
  }
}

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

    // Step 1: classify intent locally — no Gemini call spent on this anymore.
    const parsedIntent = classifyIntentLocally(message);

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

      const replyResult = await generateWithFallback(summaryPrompt);
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

    // General conversation fallback — this is now the ONLY Gemini call
    // made for non-search messages (previously there were two).
    const generalResult = await generateWithFallback(`${SYSTEM_CONTEXT}\n\nUser question: ${message}`);
    const reply = generalResult.response.text();
    res.json({ reply, searchResults: null });

  } catch (err) {
    console.error('Gemini error:', err.message);
    if (isQuotaError(err)) {
      return res.status(429).json({ error: "The AI assistant has hit its free daily usage limit. Please try again tomorrow, or the request quota resets around midnight." });
    }
    if (is503(err)) {
      return res.status(503).json({ error: "The AI assistant is experiencing high demand right now. Please try again in a moment." });
    }
    res.status(500).json({ error: 'Chatbot is currently unavailable. Please try again later.' });
  }
}

module.exports = { chat };
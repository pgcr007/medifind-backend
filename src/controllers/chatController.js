const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_CONTEXT = `You are a helpful assistant inside MediFind AI, a medicine availability app.
You can answer general questions about medicines, dosage reminders, side effects (informational only),
and how to use the app. You are NOT a doctor. For any specific medical advice, dosage changes, or
diagnosis questions, always tell the user to consult a licensed doctor or pharmacist. Keep answers
concise and easy to understand for a general audience.`;

async function chat(req, res) {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    const result = await model.generateContent(
      `${SYSTEM_CONTEXT}\n\nUser question: ${message}`
    );

    const reply = result.response.text();
    res.json({ reply });
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ error: 'Chatbot is currently unavailable. Please try again later.' });
  }
}

module.exports = { chat };
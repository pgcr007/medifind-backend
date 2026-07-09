// Mock the Gemini SDK BEFORE requiring the app, since chatController
// constructs a GoogleGenerativeAI client at module-load time.
const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent
    })
  }))
}));

const request = require('supertest');
const app = require('../../app');
const Medicine = require('../../src/models/Medicine');
const Pharmacy = require('../../src/models/Pharmacy');
const Inventory = require('../../src/models/Inventory');
const User = require('../../src/models/User');

function geminiTextResponse(text) {
  return { response: { text: () => text } };
}

async function createLoggedInUser(email = 'chatuser@test.com') {
  await request(app).post('/api/auth/register').send({ name: 'Chatty', email, password: 'pass123' });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
  return loginRes.body.token;
}

beforeEach(() => {
  mockGenerateContent.mockReset();
});

describe('POST /api/chat', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/chat').send({ message: 'hello' });
    expect(res.status).toBe(401);
  });

  it('rejects a missing message with 400 (no Gemini call made)', async () => {
    const token = await createLoggedInUser();
    const res = await request(app).post('/api/chat').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('handles a general question via the fallback path', async () => {
    const token = await createLoggedInUser();
    // Intent classification is now local (regex-based), not a Gemini call —
    // so only ONE Gemini call happens: the general reply itself.
    mockGenerateContent.mockResolvedValueOnce(
      geminiTextResponse('You should take medicines with food if they upset your stomach.')
    );

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Should I take medicine with food?' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toContain('food');
    expect(res.body.searchResults).toBeNull();
    expect(mockGenerateContent).toHaveBeenCalledTimes(1); // general reply only, no local-classification call
  });

  it('classifies as general when the message matches no search-trigger pattern', async () => {
    const token = await createLoggedInUser();
    mockGenerateContent.mockResolvedValueOnce(geminiTextResponse('Here is a general answer.'));

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'random question' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Here is a general answer.');
    expect(res.body.searchResults).toBeNull();
  });

  it('finds and summarizes real search results for a recognized medicine', async () => {
    const token = await createLoggedInUser();

    const owner = await User.findOne({ email: 'chatuser@test.com' });
    const pharmacy = await Pharmacy.create({
      ownerUserId: owner._id, name: 'City Pharmacy', address: 'Addr', latitude: 19.24, longitude: 73.13, verified: true
    });
    const medicine = await Medicine.create({ name: 'Paracetamol 650mg', genericName: 'Paracetamol' });
    await Inventory.create({ pharmacyId: pharmacy._id, medicineId: medicine._id, stockQty: 20, price: 25 });

    // "Where can I find paracetamol?" matches the local search-trigger regex,
    // so the only Gemini call made is the results-summary call.
    mockGenerateContent.mockResolvedValueOnce(
      geminiTextResponse('You can find Paracetamol at City Pharmacy nearby.')
    );

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Where can I find paracetamol?', lat: 19.2403, lng: 73.1305 });

    expect(res.status).toBe(200);
    expect(res.body.searchResults.medicineName).toBe('Paracetamol 650mg');
    expect(res.body.searchResults.pharmacies[0].pharmacyName).toBe('City Pharmacy');
    expect(res.body.reply).toContain('City Pharmacy');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('returns a not-found reply (and makes no Gemini call at all) for an unrecognized medicine', async () => {
    const token = await createLoggedInUser();

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Where can I find FakeDrugXYZ?' });

    expect(res.status).toBe(200);
    expect(res.body.searchResults).toBeNull();
    expect(res.body.reply).toContain("couldn't find");
    // Local classification + a catalog miss short-circuits before any Gemini call.
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('returns a friendly 500 if Gemini errors out (e.g. the 503 high-demand case)', async () => {
    const token = await createLoggedInUser();
    mockGenerateContent.mockRejectedValueOnce(new Error('503 Service Unavailable - model overloaded'));

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'hello' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/currently unavailable/i);
  });
});
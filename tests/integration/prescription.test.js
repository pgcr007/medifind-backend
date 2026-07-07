const request = require('supertest');
const app = require('../../app');
const Prescription = require('../../src/models/Prescription');

async function createLoggedInUser(email) {
  await request(app).post('/api/auth/register').send({ name: 'N', email, password: 'pass123' });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
  return loginRes.body.token;
}

describe('POST /api/prescriptions (create)', () => {
  it('creates a prescription record (metadata only — image itself stays on-device)', async () => {
    const token = await createLoggedInUser('presc1@test.com');
    const res = await request(app)
      .post('/api/prescriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ localImageId: 'uuid-1234', extractedText: 'Paracetamol 650mg twice daily', doctorName: 'Dr. Shah' });

    expect(res.status).toBe(201);
    expect(res.body.localImageId).toBe('uuid-1234');
  });

  it('rejects a missing localImageId with 400', async () => {
    const token = await createLoggedInUser('presc2@test.com');
    const res = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${token}`).send({ extractedText: 'x' });
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/prescriptions').send({ localImageId: 'uuid-9999' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/prescriptions (list) and /:id', () => {
  it("only lists the logged-in user's own prescriptions", async () => {
    const tokenA = await createLoggedInUser('presc3@test.com');
    const tokenB = await createLoggedInUser('presc4@test.com');
    await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${tokenA}`).send({ localImageId: 'a1' });
    await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${tokenB}`).send({ localImageId: 'b1' });

    const res = await request(app).get('/api/prescriptions').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].localImageId).toBe('a1');
  });

  it("returns 404 (not someone else's data) when fetching another user's prescription by id", async () => {
    const tokenA = await createLoggedInUser('presc5@test.com');
    const tokenB = await createLoggedInUser('presc6@test.com');
    const createRes = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${tokenA}`).send({ localImageId: 'secret-1' });

    const res = await request(app).get(`/api/prescriptions/${createRes.body._id}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/prescriptions/:id and DELETE /api/prescriptions/:id (ownership)', () => {
  it('allows the owner to update their own prescription', async () => {
    const token = await createLoggedInUser('presc7@test.com');
    const createRes = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${token}`).send({ localImageId: 'up-1' });

    const res = await request(app)
      .put(`/api/prescriptions/${createRes.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ doctorName: 'Dr. Patel', notes: 'Follow up in 2 weeks' });

    expect(res.status).toBe(200);
    expect(res.body.doctorName).toBe('Dr. Patel');
  });

  it("returns 404 when trying to update another user's prescription", async () => {
    const tokenA = await createLoggedInUser('presc8@test.com');
    const tokenB = await createLoggedInUser('presc9@test.com');
    const createRes = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${tokenA}`).send({ localImageId: 'up-2' });

    const res = await request(app)
      .put(`/api/prescriptions/${createRes.body._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ doctorName: 'Hijacked' });

    expect(res.status).toBe(404);
  });

  it("returns 404 when trying to delete another user's prescription, and the record survives", async () => {
    const tokenA = await createLoggedInUser('presc10@test.com');
    const tokenB = await createLoggedInUser('presc11@test.com');
    const createRes = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${tokenA}`).send({ localImageId: 'del-1' });

    const res = await request(app).delete(`/api/prescriptions/${createRes.body._id}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);

    const stillExists = await Prescription.findById(createRes.body._id);
    expect(stillExists).not.toBeNull();
  });
});
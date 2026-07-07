const request = require('supertest');
const app = require('../../app');
const User = require('../../src/models/User');
const Pharmacy = require('../../src/models/Pharmacy');
const Review = require('../../src/models/Review');

async function createUser(email, role = 'user') {
  await request(app).post('/api/auth/register').send({ name: 'N', email, password: 'pass123', role });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
  const user = await User.findOne({ email });
  return { token: loginRes.body.token, userId: user._id.toString() };
}

async function seedPharmacy() {
  const { token: ownerToken, userId: ownerId } = await createUser('revowner@test.com', 'pharmacy');
  const pharmacy = await Pharmacy.create({
    ownerUserId: ownerId, name: 'Reviewed Pharmacy', address: 'A', latitude: 1, longitude: 1
  });
  return { ownerToken, pharmacy };
}

describe('POST /api/reviews (upsert)', () => {
  it('creates a new review and updates the pharmacy average rating', async () => {
    const { pharmacy } = await seedPharmacy();
    const { token } = await createUser('reviewer1@test.com');

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ pharmacyId: pharmacy._id, rating: 4, comment: 'Good service' });

    expect(res.status).toBe(200);
    expect(res.body.rating).toBe(4);

    const updatedPharmacy = await Pharmacy.findById(pharmacy._id);
    expect(updatedPharmacy.averageRating).toBe(4);
    expect(updatedPharmacy.reviewCount).toBe(1);
  });

  it('does NOT require a reservation to leave a review', async () => {
    const { pharmacy } = await seedPharmacy();
    const { token } = await createUser('reviewer2@test.com');
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ pharmacyId: pharmacy._id, rating: 5 });
    expect(res.status).toBe(200);
  });

  it('overwrites (not duplicates) the same user\'s review for the same pharmacy', async () => {
    const { pharmacy } = await seedPharmacy();
    const { token } = await createUser('reviewer3@test.com');

    await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ pharmacyId: pharmacy._id, rating: 2, comment: 'Meh' });
    await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ pharmacyId: pharmacy._id, rating: 5, comment: 'Actually great' });

    const allReviews = await Review.find({ pharmacyId: pharmacy._id });
    expect(allReviews.length).toBe(1);
    expect(allReviews[0].rating).toBe(5);
    expect(allReviews[0].comment).toBe('Actually great');

    const updatedPharmacy = await Pharmacy.findById(pharmacy._id);
    expect(updatedPharmacy.averageRating).toBe(5); // recalculated, not averaged with the old 2
  });

  it('averages multiple different users\' ratings correctly', async () => {
    const { pharmacy } = await seedPharmacy();
    const { token: t1 } = await createUser('reviewer4@test.com');
    const { token: t2 } = await createUser('reviewer5@test.com');

    await request(app).post('/api/reviews').set('Authorization', `Bearer ${t1}`).send({ pharmacyId: pharmacy._id, rating: 3 });
    await request(app).post('/api/reviews').set('Authorization', `Bearer ${t2}`).send({ pharmacyId: pharmacy._id, rating: 5 });

    const updatedPharmacy = await Pharmacy.findById(pharmacy._id);
    expect(updatedPharmacy.averageRating).toBe(4); // (3+5)/2
    expect(updatedPharmacy.reviewCount).toBe(2);
  });

  it('rejects a rating outside 1-5 with 400', async () => {
    const { pharmacy } = await seedPharmacy();
    const { token } = await createUser('reviewer6@test.com');
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ pharmacyId: pharmacy._id, rating: 7 });
    expect(res.status).toBe(400);
  });

  it('rejects a pharmacy-role user posting a review with 403 (reviews are user-only)', async () => {
    const { pharmacy } = await seedPharmacy();
    const { token: otherPharmacyToken } = await createUser('anotherpharmacy@test.com', 'pharmacy');
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${otherPharmacyToken}`)
      .send({ pharmacyId: pharmacy._id, rating: 5 });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/reviews/:id/reply', () => {
  it('allows the pharmacy owner to reply to a review', async () => {
    const { ownerToken, pharmacy } = await seedPharmacy();
    const { token } = await createUser('reviewer7@test.com');
    const reviewRes = await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ pharmacyId: pharmacy._id, rating: 3 });

    const res = await request(app)
      .put(`/api/reviews/${reviewRes.body._id}/reply`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ text: 'Thanks for the feedback!' });

    expect(res.status).toBe(200);
    expect(res.body.ownerReply.text).toBe('Thanks for the feedback!');
  });

  it('rejects a reply from a non-owner pharmacy with 403', async () => {
    const { pharmacy } = await seedPharmacy();
    const { token } = await createUser('reviewer8@test.com');
    const reviewRes = await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ pharmacyId: pharmacy._id, rating: 3 });

    const { token: otherOwnerToken } = await createUser('notmypharmacy@test.com', 'pharmacy');
    const res = await request(app)
      .put(`/api/reviews/${reviewRes.body._id}/reply`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({ text: 'Sneaky reply' });
    expect(res.status).toBe(403);
  });

  it('rejects an empty reply with 400', async () => {
    const { ownerToken, pharmacy } = await seedPharmacy();
    const { token } = await createUser('reviewer9@test.com');
    const reviewRes = await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ pharmacyId: pharmacy._id, rating: 3 });

    const res = await request(app)
      .put(`/api/reviews/${reviewRes.body._id}/reply`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ text: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/reviews/:id', () => {
  it("allows a user to delete their own review and recalculates the pharmacy rating", async () => {
    const { pharmacy } = await seedPharmacy();
    const { token } = await createUser('reviewer10@test.com');
    const reviewRes = await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ pharmacyId: pharmacy._id, rating: 4 });

    const res = await request(app).delete(`/api/reviews/${reviewRes.body._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const updatedPharmacy = await Pharmacy.findById(pharmacy._id);
    expect(updatedPharmacy.averageRating).toBe(0);
    expect(updatedPharmacy.reviewCount).toBe(0);
  });

  it("rejects deleting someone else's review with 403", async () => {
    const { pharmacy } = await seedPharmacy();
    const { token } = await createUser('reviewer11@test.com');
    const reviewRes = await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ pharmacyId: pharmacy._id, rating: 4 });

    const { token: otherToken } = await createUser('notthereviewer@test.com');
    const res = await request(app).delete(`/api/reviews/${reviewRes.body._id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });
});
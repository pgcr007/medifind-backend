const admin = require('firebase-admin');

let initialized = false;

function initFirebase() {
  if (initialized) return admin;

  const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!base64Key) {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set — push notifications will not work');
    return admin;
  }

  const serviceAccount = JSON.parse(
    Buffer.from(base64Key, 'base64').toString('utf-8')
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  initialized = true;
  return admin;
}

async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!fcmToken) {
    console.warn('No FCM token provided, skipping push notification');
    return null;
  }

  const adminInstance = initFirebase();

  try {
    const response = await adminInstance.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data
    });
    return response;
  } catch (err) {
    console.error('FCM send error:', err.message);
    return null;
  }
}

module.exports = { initFirebase, sendPushNotification };
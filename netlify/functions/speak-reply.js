// netlify/functions/speak-reply.js
//
// Takes a text reply plus a userId, looks up that user's cloned voiceId in
// Firestore, and asks ElevenLabs to generate speech in that voice. Returns
// the audio so it can be streamed back into the live Twilio call.
//
// Required environment variables:
//   ELEVENLABS_API_KEY
//   FIREBASE_SERVICE_ACCOUNT
//
// Required dependencies:
//   npm install firebase-admin node-fetch@2

const fetch = require('node-fetch');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { userId, text } = body;

  if (!userId || !text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing userId or text' }) };
  }

  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const voiceId = userDoc.data()?.cloneVoiceId;

    if (!voiceId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No cloned voice found for this user yet' }) };
    }

    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      }),
    });

    if (!ttsRes.ok) {
      const errData = await ttsRes.json().catch(() => ({}));
      return { statusCode: ttsRes.status, body: JSON.stringify({ error: errData }) };
    }

    const audioBuffer = await ttsRes.buffer();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
      body: audioBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

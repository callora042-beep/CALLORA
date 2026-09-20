// netlify/functions/clone-voice.js
//
// Receives base64 audio samples from the client, sends them to ElevenLabs
// to create a cloned voice, then stores the returned voice_id on the
// user's Firestore profile so the call-assist TTS step can use it later.
//
// Required environment variables (set in Netlify site settings):
//   ELEVENLABS_API_KEY       — from elevenlabs.io account settings
//   FIREBASE_SERVICE_ACCOUNT — full JSON of a Firebase service account key, as a single-line string
//
// Required dependencies (add to package.json):
//   npm install firebase-admin form-data node-fetch@2

const fetch = require('node-fetch');
const FormData = require('form-data');
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

  const { userId, audioSamples } = body;

  if (!userId || !Array.isArray(audioSamples) || audioSamples.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing userId or audioSamples' }) };
  }

  try {
    const form = new FormData();
    form.append('name', `callora-voice-${userId}`);
    form.append('description', 'Callora cloned voice for AI call-assist replies');

    audioSamples.forEach((base64Audio, i) => {
      const raw = base64Audio.includes(',') ? base64Audio.split(',').pop() : base64Audio;
      const buffer = Buffer.from(raw, 'base64');
      form.append('files', buffer, {
        filename: `sample-${i}.webm`,
        contentType: 'audio/webm',
      });
    });

    const elevenLabsRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        ...form.getHeaders(),
      },
      body: form,
    });

    const elevenLabsData = await elevenLabsRes.json();

    if (!elevenLabsRes.ok) {
      return {
        statusCode: elevenLabsRes.status,
        body: JSON.stringify({ error: elevenLabsData }),
      };
    }

    const voiceId = elevenLabsData.voice_id;

    await admin.firestore().collection('users').doc(userId).set(
      {
        cloneVoiceId: voiceId,
        voiceCloneCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ voiceId }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

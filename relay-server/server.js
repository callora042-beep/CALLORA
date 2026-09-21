// relay-server/server.js
//
// This is the always-on piece Netlify can't host. Twilio's Media Streams
// connects to this server over WebSocket for the duration of each call.
//
// Flow per call:
//   Twilio audio in -> Deepgram (live transcript)
//     -> on each finished sentence, ask Replicate for 2-3 reply suggestions
//     -> write transcript + suggestions to Firestore (frontend listens to this)
//     -> assist mode: wait for the user to write `chosenReply` on the call doc
//        auto mode: pick the top suggestion immediately
//     -> send the chosen text to ElevenLabs (ttsToMulaw) using the user's cloneVoiceId
//     -> stream the resulting audio back into the Twilio call
//
// Deploy this folder as its own service (Railway/Render/Fly.io) — not Netlify.
//
// Env vars needed here: FIREBASE_SERVICE_ACCOUNT, DEEPGRAM_API_KEY,
// REPLICATE_API_TOKEN, ELEVENLABS_API_KEY

const WebSocket = require('ws');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const { createClient } = require('@deepgram/sdk');

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`Callora relay server listening on ${PORT}`);

wss.on('connection', (twilioWs) => {
  let callId = null;
  let userId = null;      // the Callora user whose cloned voice we speak with
  let mode = 'assist';    // pulled from the call doc once we know callId
  let dgLive = null;

  twilioWs.on('message', async (msg) => {
    const data = JSON.parse(msg);

    switch (data.event) {
      case 'start': {
        // Twilio sends custom parameters you configure on the <Stream> TwiML verb
        callId = data.start.customParameters?.callId;
        userId = data.start.customParameters?.userId;

        const callSnap = await db.collection('calls').doc(callId).get();
        mode = callSnap.data()?.mode || 'assist';

        // Open a live Deepgram connection for this call
        dgLive = deepgram.listen.live({
          model: 'nova-2',
          encoding: 'mulaw',
          sample_rate: 8000,
          interim_results: false,
        });

        dgLive.on('transcript', async (evt) => {
          const transcript = evt.channel?.alternatives?.[0]?.transcript;
          if (!transcript || !evt.is_final) return;
          await handleFinalTranscript({ callId, userId, mode, transcript, twilioWs, streamSid: data.start.streamSid });
        });

        break;
      }

      case 'media': {
        // Base64-encoded mulaw/8000 audio chunk from the caller's side of the call
        if (dgLive) {
          dgLive.send(Buffer.from(data.media.payload, 'base64'));
        }
        break;
      }

      case 'stop': {
        if (dgLive) dgLive.finish();
        if (callId) {
          await db.collection('calls').doc(callId).update({
            status: 'ended',
            endedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        break;
      }
    }
  });

  twilioWs.on('close', () => {
    if (dgLive) dgLive.finish();
  });
});
// --- Core turn logic -------------------------------------------------------

async function handleFinalTranscript({ callId, userId, mode, transcript, twilioWs, streamSid }) {
  const callRef = db.collection('calls').doc(callId);

  await callRef.update({
    liveTranscript: admin.firestore.FieldValue.arrayUnion({
      speaker: 'caller',
      text: transcript,
      at: new Date().toISOString(),
    }),
  });

  const suggestions = await getSuggestions(transcript);
  await callRef.update({ currentSuggestions: suggestions });

  let chosenText;

  if (mode === 'auto') {
    chosenText = suggestions[0];
  } else {
    // Assist mode: wait for the user to write their pick to `chosenReply`
    // on the call doc (the frontend sets this when they tap/edit a suggestion).
    chosenText = await waitForChosenReply(callRef);
  }

  await callRef.update({
    liveTranscript: admin.firestore.FieldValue.arrayUnion({
      speaker: 'ai',
      text: chosenText,
      at: new Date().toISOString(),
    }),
    currentSuggestions: null,
    chosenReply: null, // clear for the next turn
  });

  const audioMulawBase64 = await ttsToMulaw({ userId, text: chosenText });
  sendAudioToTwilio(twilioWs, streamSid, audioMulawBase64);
}

async function getSuggestions(transcript) {
  const prompt = `You're helping someone reply naturally during a live phone call. The other person on the call just said: "${transcript}"

Give exactly 3 short, casual reply options (under 15 words each) they could say back. Return only the 3 replies, one per line, no numbering, no extra text.`;

  const startRes = await fetch('https://api.replicate.com/v1/models/meta/meta-llama-3-8b-instruct/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'wait', // ask Replicate to hold the request open until done, when possible
    },
    body: JSON.stringify({
      input: {
        prompt,
        max_new_tokens: 150,
        temperature: 0.7,
      },
    }),
  });

  let prediction = await startRes.json();

  // If Prefer: wait timed out before completion, poll until it's done
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    await new Promise((r) => setTimeout(r, 500));
    const pollRes = await fetch(prediction.urls.get, {
      headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` },
    });
    prediction = await pollRes.json();
  }

  if (prediction.status === 'failed') {
    throw new Error(`Replicate prediction failed: ${prediction.error}`);
  }

  const text = Array.isArray(prediction.output) ? prediction.output.join('') : (prediction.output || '');
  return text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
}

function waitForChosenReply(callRef) {
  return new Promise((resolve) => {
    const unsubscribe = callRef.onSnapshot((snap) => {
      const chosen = snap.data()?.chosenReply;
      if (chosen) {
        unsubscribe();
        resolve(chosen);
      }
    });
  });
}

async function ttsToMulaw({ userId, text }) {
  const userDoc = await db.collection('users').doc(userId).get();
  const voiceId = userDoc.data()?.cloneVoiceId;
  if (!voiceId) throw new Error(`No cloneVoiceId for user ${userId}`);

  const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=ulaw_8000`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });

  if (!ttsRes.ok) {
    throw new Error(`ElevenLabs TTS failed: ${await ttsRes.text()}`);
  }

  // output_format=ulaw_8000 gives us raw mulaw/8kHz already — exactly what
  // Twilio's media stream expects, so no extra audio conversion needed.
  const buffer = await ttsRes.buffer();
  return buffer.toString('base64');
}

function sendAudioToTwilio(twilioWs, streamSid, mulawBase64) {
  twilioWs.send(JSON.stringify({
    event: 'media',
    streamSid,
    media: { payload: mulawBase64 },
  }));
    }

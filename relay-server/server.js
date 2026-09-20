// relay-server/server.js
//
// This is the always-on piece Netlify can't host. Twilio's Media Streams
// connects to this server over WebSocket for the duration of each call.
//
// Flow per call:
//   Twilio audio in -> Deepgram (live transcript)
//     -> on each finished sentence, ask Claude for 2-3 reply suggestions
//     -> write transcript + suggestions to Firestore (frontend listens to this)
//     -> assist mode: wait for the user to write `chosenReply` on the call doc
//        auto mode: pick the top suggestion immediately
//     -> send the chosen text to ElevenLabs (ttsToMulaw) using the user's cloneVoiceId
//     -> stream the resulting audio back into the Twilio call
//
// Deploy this folder as its own service (Railway/Render/Fly.io) — not Netlify.
//
// Env vars needed here: FIREBASE_SERVICE_ACCOUNT, DEEPGRAM_API_KEY,
// ANTHROPIC_API_KEY, ELEVENLABS_API_KEY

const WebSocket = require('ws');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const { createClient } = require('@deepgram/sdk');
const Anthropic = require('@anthropic-ai/sdk');

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

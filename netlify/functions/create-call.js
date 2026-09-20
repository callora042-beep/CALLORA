// netlify/functions/create-call.js
//
// Starts a Twilio call between a caller and provider, and points the call's
// audio at the relay server so the AI call-assist feature can listen in.
//
// Required environment variables:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
//   RELAY_SERVER_WS_URL   — e.g. wss://callora-relay.up.railway.app
//   FIREBASE_SERVICE_ACCOUNT
//
// Required dependencies:
//   npm install twilio firebase-admin

const twilio = require('twilio');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { callerId, providerId, providerPhoneNumber, mode } = JSON.parse(event.body);

  if (!callerId || !providerId || !providerPhoneNumber) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing callerId, providerId, or providerPhoneNumber' }) };
  }

  try {
    const callDoc = await db().collection('calls').add({
      callerId,
      providerId,
      status: 'ringing',
      mode: mode || 'assist',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      endedAt: null,
      liveTranscript: [],
      currentSuggestions: null,
      chosenReply: null,
    });

    const twiml = `
      <Response>
        <Connect>
          <Stream url="${process.env.RELAY_SERVER_WS_URL}">
            <Parameter name="callId" value="${callDoc.id}" />
            <Parameter name="userId" value="${callerId}" />
          </Stream>
        </Connect>
      </Response>
    `.trim();

    const call = await client.calls.create({
      to: providerPhoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ callId: callDoc.id, twilioCallSid: call.sid }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function db() {
  return admin.firestore();
}

// netlify/functions/generate-ai-reply.js
//
// Takes a live call transcript, asks a Replicate LLM to generate a short
// natural spoken reply. Returns just the reply TEXT — actual voice synthesis
// is handled separately by speak-reply.js (which looks up the user's cloned
// voice in Firestore and calls ElevenLabs).
//
// Flow: transcript -> generate-ai-reply.js -> replyText -> speak-reply.js -> audio
//
// Required environment variables:
//   REPLICATE_API_TOKEN

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// A fast, cheap instruct model good for short conversational replies.
// Swap this for any chat model on Replicate you prefer.
const REPLICATE_MODEL_VERSION = "meta/meta-llama-3-8b-instruct";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { transcript } = body;

  if (!transcript) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing transcript" }) };
  }

  try {
    const replyText = await generateReplyText(transcript);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyText }),
    };
  } catch (err) {
    console.error("generate-ai-reply error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

async function generateReplyText(transcript) {
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Token ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REPLICATE_MODEL_VERSION,
      input: {
        prompt: buildPrompt(transcript),
        max_tokens: 80,
        temperature: 0.7,
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Replicate create error: ${errText}`);
  }

  let prediction = await createRes.json();

  while (
    prediction.status !== "succeeded" &&
    prediction.status !== "failed" &&
    prediction.status !== "canceled"
  ) {
    await sleep(500);
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` } }
    );
    prediction = await pollRes.json();
  }

  if (prediction.status !== "succeeded") {
    throw new Error(`Replicate prediction failed: ${prediction.error}`);
  }

  const output = Array.isArray(prediction.output)
    ? prediction.output.join("")
    : prediction.output;

  return String(output).trim();
}

function buildPrompt(transcript) {
  return `You are helping someone respond naturally during a live phone call.
Based on what the caller just said, suggest ONE short, natural spoken reply
(under 25 words, conversational tone, no explanations, no quotation marks).

Caller said: "${transcript}"

Reply:`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

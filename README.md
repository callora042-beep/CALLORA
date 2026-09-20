# Callora

Your time. Your conversation.

A two-sided voice-call marketplace with an AI call-assist feature: live transcription of what the caller says, AI-suggested replies, and (in auto mode) replies spoken back in your own cloned voice.

## Architecture — who hosts what

Callora is split across two hosts because Netlify's serverless functions are short-lived and can't hold a live audio stream open. Everything else fits Netlify fine.

| Piece | Hosted on | Why |
|---|---|---|
| Frontend (static HTML/CSS/JS) | **Netlify** | Static hosting, fits your existing workflow |
| Short-lived API calls (voice cloning, one-off TTS, payments) | **Netlify Functions** | Request/response only, no long connection needed |
| Relay server (live call audio ↔ STT ↔ AI ↔ TTS) | **Railway** (or Render/Fly.io) | Needs an always-on WebSocket connection — Netlify can't do this |
| Database & realtime state | **Firebase (Firestore)** | Already your standard — also used to push live suggestions to the app UI |
| Call bridging | **Twilio** | Programmable Voice + Media Streams |
| Live transcription | **Deepgram** | Real-time streaming STT |
| Reply suggestions | **Claude API** (or Replicate) | Generates 2–3 short reply options from the live transcript |
| Cloned-voice speech | **ElevenLabs** | Voice cloning + text-to-speech |

Callora is free to use — there's no payment layer.

## Connection map

1. **Twilio** bridges the call and forks live audio to the **relay server** via Media Streams (WebSocket).
2. The **relay server** streams that audio to **Deepgram**, which returns a live transcript.
3. On each finished sentence, the relay server sends the transcript to **Claude API**, which returns 2–3 short reply suggestions.
4. The relay server writes the transcript line + suggestions to **Firestore**, under that call's document.
5. The **frontend** is listening to that Firestore document in real time, so suggestions appear on screen instantly.
   - **Assist mode:** the user taps one, edits it, or writes a custom reply, then writes their chosen text back to Firestore.
   - **Auto mode:** the relay server picks the top suggestion itself, no user action needed.
6. Whichever reply is chosen, the relay server calls **ElevenLabs** with that user's `cloneVoiceId` to generate speech.
7. That audio is streamed back into the live Twilio call, so the caller hears "you" respond.
8. Repeat from step 2 until the call ends. Full transcript, suggestions used, and call metadata are saved to Firestore for history.

## Pages built

| Page | Status |
|---|---|
| `index.html` | Auth-state router |
| `login.html` | Firebase Auth signup/login |
| `profile-setup.html` | Name, phone, role |
| `home.html` | Live provider discovery from Firestore |
| `provider.html` | Provider profile + starts a real call |
| `call.html` | Live call screen — real-time AI suggestions, assist/auto toggle |
| `calls.html` | Call history (no billing — everything's free) |
| `account.html` | Profile, voice clone status, default mode, logout |
| `voice-onboarding.html` | Record & clone your voice via ElevenLabs |

See `LAUNCH-PLAYBOOK.md` for Days 14–28 (testing, content, marketing, security, launch, growth) — mostly checklists rather than code, plus one open technical gap (call billing) worth closing before launch.

## Repo layout

```
callora/
├── netlify/functions/     → short request/response functions (voice cloning, one-off TTS, call setup, payments)
├── relay-server/          → always-on Node service, deployed separately to Railway
├── public/                → static frontend (HTML/CSS/JS)
├── firebase/              → Firestore rules and schema notes
├── netlify.toml           → Netlify build/functions config
└── .env.example           → all required environment variables, for both Netlify and the relay server
```

## Setup

1. `npm install` at the repo root (installs Netlify function dependencies).
2. `cd relay-server && npm install` (separate dependencies, deployed separately).
3. Copy `.env.example` to `.env` and fill in real keys.
4. Deploy `public/` + `netlify/functions/` to Netlify as usual.
5. Deploy `relay-server/` to Railway (or similar) as its own service, with its own copy of the relevant env vars.
6. Point your Twilio phone number's voice webhook at the Netlify function that starts the call, and configure the Media Stream to point at the relay server's WebSocket URL.

See `firebase/firestore-schema.md` for the Firestore collection structure.

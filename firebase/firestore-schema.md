# Firestore schema

Callora is free — there's no wallet, billing, or transactions collection.

## `users/{userId}`

{
name: string,
email: string,
role: "caller" | "provider" | "both",
phone: string,
cloneVoiceId: string | null,      // set after voice-onboarding.html completes
callAssistMode: "assist" | "auto", // user's default mode preference
createdAt: timestamp
}

## `calls/{callId}`

{
callerId: string,
providerId: string,
status: "ringing" | "active" | "ended",
mode: "assist" | "auto",
startedAt: timestamp,
endedAt: timestamp | null,
durationSec: number,
liveTranscript: [                  // appended to in real time by the relay server
{ speaker: "caller" | "provider" | "ai", text: string, at: timestamp }
],
currentSuggestions: [string, string, string] | null,  // cleared after each reply is chosen
}

## Notes

- `currentSuggestions` on the call document is what the frontend listens to for the AI suggestion UI. The relay server writes to it; the frontend writes the chosen reply to a `chosenReply` field, which the relay server watches to trigger text-to-speech.

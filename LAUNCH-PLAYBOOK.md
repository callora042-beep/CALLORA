# Callora — Days 14–28 Launch Playbook

Days 1–13 produced the actual app (brand, UI, repo, auth, discover, provider profiles, live calls, wallet, settings). These remaining days are mostly process, content, and judgment calls rather than code — so they're captured here as one working checklist instead of separate files.

## Day 14 — Testing & bug fixes
- [ ] Full signup → profile setup → home flow, on a real phone
- [ ] Provider profile → call now → live call screen end to end
- [ ] Assist mode: tap a suggestion, confirm it reaches Firestore's `chosenReply`
- [ ] Auto mode: confirm the relay server picks and speaks automatically
- [ ] Wallet top-up → Paystack → verify-payment → balance updates
- [ ] Voice cloning flow with a real recorded voice, confirm `cloneVoiceId` saves
- [ ] Test on a slow connection — do Firestore listeners recover after a drop?

## Day 15 — Content & onboarding
- [ ] Write a short FAQ (how billing works, how voice cloning works, what assist vs. auto means)
- [ ] Add 2–3 sample provider profiles as placeholder content so `home.html` isn't empty on first launch
- [ ] Write the empty-state and error copy for each screen (already stubbed in the HTML — replace with final wording)

## Day 16 — Marketing materials
- [ ] 3–5 social posts introducing Callora (what it does, who it's for)
- [ ] A 30–60 second demo video/screen recording of the call flow
- [ ] Simple one-page description for DMs/word-of-mouth sharing

## Day 17 — Beta launch (soft launch)
- [ ] Invite a small group of real testers (5–10 people)
- [ ] Give them both roles to try — one call as caller, one as provider
- [ ] Collect feedback on: clarity of assist/auto modes, call audio quality, whether the cloned voice sounded natural

## Day 18 — Provider onboarding
- [ ] Confirm `profile-setup.html`'s provider path is clear enough for a new provider
- [ ] Add a simple provider dashboard view later — for now, `account.html` + `calls.html` cover it

## Day 19 — (skipped — no payments)
Callora is free, so there's no payment/payout testing to do here.

## Day 20 — Security & safety
- [ ] Deploy `firebase/firestore.rules` and test that a user can't read another user's private data
- [ ] Add a report/block button on `provider.html` (simple Firestore flag for MVP)
- [ ] Write a one-paragraph terms of service / privacy note (who owns the voice clone data, how call transcripts are stored)

## Day 21 — Pre-launch review
- [ ] Full run-through as a brand-new user with zero prior setup
- [ ] Fix anything confusing in the first five minutes of the experience
- [ ] Confirm all nav links across every page actually go somewhere real

## Day 22 — Official launch
- [ ] Deploy `public/` + `netlify/functions/` to Netlify
- [ ] Deploy `relay-server/` to Railway (or similar)
- [ ] Point Twilio's number webhook at `create-call.js`
- [ ] Share it

## Day 23 — User engagement
- [ ] Respond personally to early testers' feedback
- [ ] Ask for one honest review/testimonial from someone who used it

## Day 24 — Analyze & improve
- [ ] Check Firestore for real usage patterns — which categories get used, assist vs. auto split
- [ ] Fix the biggest friction point you're seeing

## Day 25 — Expand categories
- [ ] Add more chip categories to `home.html` based on what testers actually wanted

## Day 26 — Marketing push
- [ ] A slightly wider content push based on what resonated in Day 16

## Day 27 — (skipped — no monetization)
Callora is free. If you want to revisit this later, options include optional donations or a future premium tier — not required for the MVP.

## Day 28 — Plan the next phase
- [ ] Candidates for v2: automated provider payouts, group calls, in-app messaging, better analytics dashboard


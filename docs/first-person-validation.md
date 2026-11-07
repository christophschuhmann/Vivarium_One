# First-Person RPG validation · 7 November 2026

The restored RPG runs in an independent checkout and data directory. The procedural
routes and startup upgrades are not registered in its server, and its browser no
longer loads the town simulation's UI modules.

## Automated checks

- `npm run test:rpg`: passed. Age-range filtering, same-identity neutral/emotion
  images, no image calls during a library build, explicit-generation rejection
  without consent, one ordinary story call, preserved off-screen state, decision
  stops, authenticated previews, selected backgrounds and remapped player IDs and
  decision prompts in an imported save.
- `npm run test:providers`: passed. Separate user credentials, one-key setup,
  provider routing for language/image/TTS/ASR, catalog validation, no credit debit
  for personal-key use, and PCM requests for Google speech models.
- `npm run test:speech`: passed. Long speech completeness, incomplete-cache
  rejection, cache reuse, regeneration, transient failures and permanent errors.
- Browser checks on Chromium at 1480×960 and 390×844: passed. Bounded 24-image
  results, age/gender search, eight-slot scenario review, dismissing generation
  confirmation, player action and identity UI, Mind, OpenRouter settings and
  mobile scrolling/layout. No uncaught JavaScript errors.
- An actual portrait upload was decoded, matted, copied into the story and served
  successfully. The disposable test copies were removed afterwards.

## Live provider checks

The test account used OpenRouter for every model role. No new image generation
was performed: actual image generation remains user-confirmed, while its request
format is covered by stubbed provider tests.

An initial real story beat with `google/gemini-3.8-flash` took **17.65 seconds**:
7,620 prompt tokens and 2,311 completion tokens, producing a continuous scene and
a player decision. This was the initial smoke test, before the subsequent removal
of sprite-file identifiers from story context; it is an observation, not a latency
promise. The playable example retains that scene.

A real Gemini 3.8 Flash TTS request initially exposed an adapter error: it requested
MP3 although that endpoint requires PCM. After correction, the test sentence was
returned in **4.35 seconds**, as **5.4 seconds of playable WAV audio**. Passing it
through OpenRouter transcription returned the exact spoken sentence in **1.21
seconds**. The regression fixture now rejects a Google speech request using MP3.

The four-character/four-location example was assembled in **29.09 seconds** from
existing library images, including matching expression cutouts, without image API
calls. First extraction can be slower than cached reuse.

The local library snapshot contains **12,943 images**, including **11,250 character
images across 740 identities**. Sources and pinned revisions are recorded in the
catalog and in imported asset metadata.

## Backup checks and evidence

The previous code is preserved by `backup/living-world-before-rpg-2026-11-07` on
GitHub. A **1,725,631,064-byte encrypted runtime archive** was uploaded to a private
GitHub release; a full local AES-GCM authentication pass succeeded. Final
pre-switch database snapshots are retained separately as well. Recovery keys
remain outside GitHub.

Screenshots: [desktop scene](../artifacts/first-person/stage.png),
[phone scene](../artifacts/first-person/mobile-stage.png),
[scenario image review](../artifacts/first-person/review.png).

## Limits

Library metadata is used for age and visual matching; it does not constitute a
face-age assessment. The image review exists so players can correct a mismatch.
New image generation was not charged during testing. There was no exhaustive
long-running evaluation of every possible story or model in the live catalog.

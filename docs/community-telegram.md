# Community bot moderation settings

The community settings sidebar routes Telegram and Assistant separately.
Telegram manages the community bot, channel selection and confirmation,
automatic publication, the latest twenty public posts and delivery review.
Assistant manages write-only OpenRouter and ElevenLabs credentials, model and
voice selection, instructions, daily limits and recent conversation context.
Only a successful owner-authorized settings read grants access to these sections.

The generated api-next client uses the existing same-origin session and CSRF
transport. Stored credentials are never returned. Credential inputs clear on
submission, including failed saves. Replacing a credential preserves unsaved
assistant preferences. Voice defaults to replying with text and speech to voice
messages and text to text messages.

The app Storybook includes Telegram, Assistant and BotSidebar under
Screens/Community/OwnerSettings. Its nineteen stories cover setup, errors,
permissions, delivery review, credential replacement and navigation. All
nineteen pass the accessibility and interaction sweep. The sidebar was also
inspected at 390-pixel and 1280-pixel widths; the mobile page has no horizontal
overflow.

Local verification passed the 550-test app suite, 140 session/API tests,
65 focused owner-settings and route tests after the final presentation changes,
TypeScript, lint, Worker build, Storybook build, generated-client provenance
and production dependency checks. Existing lint warnings and bundle-size
advisories remain. This is local fixture evidence, not live provider acceptance.

The vendored client is version 0.67.0 with provenance recorded beside the
artifact. Backend activation, wrapping secrets, queues and migration 0131 are
documented in api-next's community Telegram runbook. The backend feature remains
disabled until an authorized activation; no credentials, webhook or deployment
were provisioned by this change.

API keys are encrypted with AES-256-GCM in api-next PostgreSQL records. The
wrapping key is separate: Infisical owns its canonical custody, and the API
and jobs Workers receive it as a secret binding during activation. Keys are
validated server-side before replacement; reads expose status only. The
browser does not persist keys in localStorage or call providers directly.

Staging preparation on 2026-09-08 created the Telegram queue and stored the
wrapping key in Infisical. Live staging remains on schema 0109 behind the
coordinated persona reset/release gate. Telegram requires schema 0131, so the
moderation routes and provider checks have not been deployed or exercised live.
The serving Worker secrets were not changed. After the paired release, an
owner must enter the dedicated test bot and provider keys through these panels
before controlled channel, text and voice acceptance.

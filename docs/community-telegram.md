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

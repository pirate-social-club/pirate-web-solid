Onboarding E2E execution, 2026-09-11

The configured Privy test identity was injected through the staging operator
secret runner. Sign-in succeeded and the authenticated context opened
/communities/new. The deployed form displayed Invalid body request beside
Retry profiles. The journey failed at community creation, before uploading or
publishing a song. It did not create a successful community or post.

The attached sanitized network events record HTTP 200 for the creation page,
the current-user read and the personas read. No creation POST appears in this
capture. This evidence therefore does not establish an HTTP rejection or its
root cause; the failure is in the served community/profile setup flow. Do not
attribute it to a particular worker revision from this run alone.

The initial execution exposed stale test selectors: the login UI uses inline
email entry and six Verification code digit inputs, followed by Verify and
continue. Updating the fixture allowed real sign-in. The final execution
failed explicitly at community creation in 3.6 seconds after authentication.
No database reset, deployment, provider configuration or media processing ran.

Local verification passed frozen-lockfile installation, check:e2e (TypeScript
and discovery of 15 tests), oxlint e2e and six preflight assertions. An explicit
run without credentials exited 1 before browser startup. Those checks do not
replace a passing real journey. The generated MP3 is untested by media providers.

The next acceptance gate is a working community-creation flow on a prepared
nonproduction target. After that, this same command must reach upload,
processing, publication, feed reload and playback/seek without mocks. Lyrics,
retention, ACR, moderation and engagement require their own remaining evidence.

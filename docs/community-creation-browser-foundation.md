# Community creation browser foundation

This tranche starts at Solid 31b38a238467463bef5ca9e0943d87d3eb7aac62 and
reviews the song lane at eeade42ee71e7fb5a2ce502c20da7898cc34e4c6. The
source manifest records SHA-256 digests of imported files at that commit and
of the adapted destination files. Recompute a source digest with
`git show <sourceCommit>:<path> | sha256sum`; compute the destination digest
with `sha256sum <path>`.

The shared authentication fixture now uses the current email-first sign-in
view and six InputOTP controls. Environment lookup is shared with the required
preflight. The imported creation helper uses community-focused copy and
ignores empty alert containers. Failure diagnostics drain pending response
bodies before reporting, redact private values and handle rejected capture
promises. The event buffer retains the latest 100 events so early page noise
does not permanently suppress later creation diagnostics. Node tests exercise the sign-in sequence and asynchronous diagnostic
teardown without opening a browser. These are helper regressions, not evidence
of a successful product journey.

The source lane's preflight informed the shared environment validation and its
configuration informed suppression of raw DOM error contexts. The imported
browser instrumentation test was replaced with focused event-emitter tests to
keep this gate independent of Chromium. No runtime imports point into the
source worktree. Source and adapted hashes describe different bytes when the
helper was changed; this is an owned import rather than a cherry-pick.

The playback-grant retry at eeade42 was reviewed: the cached-grant retry
resumes existing media rather than unnecessarily pausing and waiting for new
metadata. It and the concurrent composer changes are outside this test-only
tranche. The earlier creation/publication run and the later playback/seek run
remain separate evidence; this import does not establish an uninterrupted song
journey or integrate those product fixes.

The new required creation spec uses real UI writes and same-origin read-only
API assertions. It covers creation, owner access, active bound identity,
membership, reload and reopening a committed intent without duplicate writes.
It does not yet cover revision-conflict recovery, interrupted verification or
future zk gates. The audited revision-recovery fix and repository separation
remain subsequent cleanup tranches.

A configured product browser run remains required before this lane can be
called end-to-end verified. No remote mutation or deployment is implied by
helper tests, discovery or negative preflight runs.

## Verification on 2026-09-12

The focused helper gate passes 10 tests with no skips. The E2E TypeScript
check passes, and Playwright discovery lists 15 tests in nine files. The
required command was invoked with absent mutation consent, absent credentials
and a production target separately: each returned exit 1 with its expected
preflight error before a test worker started. Changed-file oxlint passes, and
workspace `bin/script-check --changed` reports zero findings.

Verification was serialized in a user systemd scope capped at 50% of one CPU,
1 GiB of memory and zero swap (smaller checks used lower memory limits). No
Chromium, development server, full verify, application build, API suite or
live product mutation was run. Existing installed dependencies were linked
locally for checking; no dependency installation or lockfile change occurred.
The first type-check attempt exposed a missing optional-route contract guard
in the new spec and absent nested UI dependency links in the fresh worktree;
both were corrected before the passing check.

The real configured creation journey is still pending. Its pass requires the
candidate build, a prepared api-next environment and injected test credentials.
The source manifest and local checks are review evidence, not live acceptance.

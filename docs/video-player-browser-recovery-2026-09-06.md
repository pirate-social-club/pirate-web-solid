# Original-audio player and local browser recovery

This is a local Solid lane checkpoint after immutable client 0.65.0 adoption.
It does not enable video, deploy a Worker, mint a live Stream token, run a
provider job or establish staging acceptance.

The shared feed and Post player obtains access when visible and foregrounded,
renews through the same endpoint, and drops buffered media on denial or expiry.
Grants remain in component memory. Feed references are never interpreted as
URLs. The poster uses the same-origin cookie-authorized route independently
of playback readiness. HLS uses pinned hls.js 1.7.2 with a native fallback.
The ordinary route CSP admits Stream media and its worker; verification routes
retain their existing policy. The reviewed runtime table includes both access
operations and remains on the immutable 0.65.0 artifact.

Review fixed unnecessary mixed-feed scanning, late-thumbnail updates, and
stale media callbacks. The composer polls review as well as processing and
distinguishes membership recovery from non-retryable provider uncertainty.
The later integration correction below preserves shared source storage and
receipt ownership while adding pause fences to the existing coordinator.
Participation cannot create a competing draft implementation.

## Browser evidence and reproducibility

Run scripts/video-browser-proof-server.mjs from this repository and open
http://127.0.0.1:4198/__video-proof with agent-browser using a persistent profile.
The fixture uses the real browser storage, coordinator, transport and generated
response validation, with a simulated API and multipart transport boundary.
Its localStorage entry represents only fixture-server state, never auth.

Click Start interrupted upload. The first part succeeds and part two fails.
Close the entire browser, wait beyond the fixture's two-second part URL TTL,
then reopen the same origin with the same profile. Click Restore retained
operation and Resume upload. The retained source is exactly abcdefghi and the
operation remains submission-fixture. Part one is not uploaded twice, parts
two and three renew, receipts become [1,2,3], and finalize is called once.
The nine-byte source is deliberately not an encoded MP4; this proves persistence
and upload recovery, not camera codec correctness. The production reservation
ceiling remains one hour pending the recorded owner ratification.

The local HLS fixture can be generated with ffmpeg from testsrc at 160x90,
24 fps and a 48 kHz sine source, six seconds, H.264 plus AAC, GOP 24,
two-second HLS segments. Serve master.m3u8 and segment_000.ts through
segment_002.ts from VIDEO_PROOF_MEDIA_DIR, default /tmp/pirate-video-proof-media.
The player fixture uses a local URL and short timers, not the production
grant validator or a live Stream origin. A user gesture started decoding:
the final observation recorded readyState 4, duration 6.037333 seconds and
currentTime 0.141403. Setting the fixture-server denied flag made renewal
return unavailable with both src and poster absent. The final player includes
the reviewed attachment cleanup and stale-callback fences.

Raw before/after restart and final playback/denial observations are retained
with the complete-history capture. Browser processes and the local fixture
server are closed after the proof. Earlier experiments included a native-HLS
capability false positive in Chromium and a nonexistent fixture-host fetch;
the accepted decode observation uses local HLS only.

## Verification

The final full application run passed 445 tests across 65 suites, exit 0.
The API run passed 129 tests across 26 suites, exit 0. The final focused review
run passed ten tests across two suites, exit 0. TypeScript, e2e type/discovery,
lint, runtime-table validation, client provenance, production client/SSR build,
script-check and diff-check passed. Lint and build retain baseline warnings.

Earlier attempts are retained: initial Solid ownership-write errors and one
incorrect disposal assertion failed before repair; a module-mocking lint
error was replaced by an explicit attachment seam; adding the browser fixture
to e2e type checking required DOM.Iterable. Under shared-host memory pressure,
a focused run and a later full application and Storybook run were interrupted
with exit 130. The final application and API reruns above passed. The standalone Storybook retry again stalled under memory and disk pressure.
An interrupt was requested; its final exit and the redundant final type run
were still pending at preservation. Storybook remains an incomplete gate.

Physical-device recording, visibility/interruption behavior during capture,
browser quota eviction and source reselection, deployed session/persona
compatibility, actual signed Stream access and the combined staging publication
proof remain open. The local recovery source is intentionally tiny and does
not establish large-upload performance. Every clean video still requires the
ratified API safety approval during proof. Song-backed recording and server
soundtrack construction remain phase two.

## Independent lifecycle review continuation

Review found and fixed three local lifecycle errors: successful explicit retry
now restores the authorized poster, renewal preserves the current user pause
rather than sticky historical play intent, and seeking to zero is retained.
Playback state is captured only for attached media with metadata, so hiding
while replacement metadata loads cannot overwrite the retained position or
intent with teardown defaults. Eight focused player cases pass, including
renewal at position 25 followed by hide/show before metadata, exit 0.

The continuation Storybook build completed successfully, exit 0, superseding
the incomplete prior attempts. The final application suite passes 448 cases
across 65 suites; TypeScript, lint and the production build pass, all exit 0.
The first new type run failed because a test variable inferred the literal
HAVE_METADATA value; the fixture now declares a numeric readiness variable.
The failed log remains evidence. No deployed or physical-browser claim changes.

Solid main has advanced with persona/HNS changes since this branch's base.
Reconciliation with main and integration validation remain before a paired
staging deployment. No shared draft or participation behavior changed here.


## Main integration and global composer browser proof

The integration imports Solid main 2f4a1d1dd628f37e378a6ca0526239d83e76047f
without overwriting client 0.65.0. The audited runtime-table union includes
43 operations, including main's HNS root-list operation and the two video
access operations. Main's persona changes remain intact.

The mounted parent test exposed a real entry gap: the generic Video tool
opened an attachment picker before reaching the production runtime. The
parent now supplies onVideoEntry to route that same visible action directly
to original-video capture or recovery. Other composer consumers keep their
generic picker when the callback is absent. No second entry button was added.

The retained authority callback now restores community as well as persona.
Global Create post recovers the community automatically. Opening the retained
attempt from a different community displays the existing context conflict
and Resume refuses before uploading or finalizing. The coordinator's pause
revision fences prevent later effects after navigation or Pause, even while
reserve, start or a snapshot read is pending. Already received outcomes are
saved; an ambiguous command is retained. Explicit Resume is still possible.
The runtime checks disposal after begin before calling a new submit operation.

The local browser fixture now mounts real CreatePostDialog with its explicit
videoStorage and videoTransport seams. It imports the app CSS through the
existing Tailwind Vite plugin. It is not a deployed application route or an
authentication fixture. To repeat, use a dedicated persistent Chrome profile,
set the viewport to 1280 by 1100, and run these steps:

1. Click Start interrupted upload. Inspect the retained nine-byte abcdefghi
   source, community-fixture, persona-fixture, submission-fixture and receipt 1.
2. Close the entire browser process. Reopen the same origin with that profile
   after the two-second fixture part URLs expire; do not import a storage-state
   JSON file as a substitute for preserving IndexedDB.
3. Open conflicting community composer, click its existing Video control,
   then Resume video submission. Observe the explicit original-authority
   refusal. The fixture ledger must retain finalized false and no additional
   part PUT beyond the original successful part 1 and interrupted part 2.
4. Close that dialog. Open global composer and click Video. Confirm Community
   ID restores to community-fixture. Resume video submission through the real
   dialog, then close it and click Inspect retained operation.

The final Chrome observation retained exactly abcdefghi, the same community,
persona and submission, receipts [1,2,3], no pending command, and processing
analysis. The ledger contained one reserve, one start and one finalize. Part
1 was PUT once; interrupted part 2 was retried only after renewal, and part 3
was renewed and uploaded. Final PUT contents were abc, def and ghi. Background
mint fixture events are separate from upload and publication evidence.

The host restarted during the later TypeScript gate and cleared /tmp. The first proof and earlier gates survive as conversation tool receipts, not retained raw files. The global proof was repeated after restart and its raw observations now live under docs/evidence/video-solid-integration-2026-09-06. browser-before-restart.json and browser-after-resume.json record the bytes, identities and receipts; browser-context-denial.txt and browser-context-server.json prove the refused contextual resume; browser-global-restored-inputs.json records the actual restored Community ID input. browser-assertions.log records the checked invariants, exit 0. Both browser closure receipts are retained. The fixture server was stopped intentionally after the proof and returned 143.

Earlier attempts used an unstyled fixture and an offscreen Video control.
Event tracing showed the automation clicked HTML outside the modal, not the
Video button. Enlarging the viewport and loading application styling resolved
that fixture-interaction error. No speculative production focus change was
retained. The earlier coordinator-only browser proof remains valid at its
narrower boundary; this continuation supplies the missing real parent proof.

Neither browser fixture validates a real MP4 upload, live provider access,
authenticated posting permission or production clock/URL policy. Physical
capture, large uploads, eviction/reselection and the coordinated staging proof
remain separate acceptance obligations. Video stays disabled on the server.

## Dependency audit at integration

The first dependency audit failed with GHSA-58qx-3vcg-4xpx and GHSA-96hv-2xvq-fx4p. The vulnerable edge already exists on origin/main: @zkpassport/sdk to @zkpassport/utils to @zk-kit/utils 1.4.1 to ethers 6.13.5 to its exact ws 8.17.1 dependency. The narrow package override ethers>ws pins that edge to the already-used ws 8.21.3; it changes no provider or ethers version and no other dependency resolution. This is a package policy change, not a lock-only refresh.

Bun 1.4.0, which is pinned in package.json and CI, supports the parent-scoped override and its generated lockfileVersion 3. A scratch frozen-install probe and the actual repository frozen install both passed. The lock diff contains only the format change, override metadata and ethers/ws resolution. Bun documents this parent scope and format requirement at https://bun.sh/docs/pm/overrides. The original audit failure and first successful checks survive in conversation tool receipts; their /tmp files were lost in the host restart. Repeated frozen-install and audit receipts are retained in the durable evidence directory, with no vulnerabilities across 676 packages, exit 0.

## Final local integration validation

The complete application suite passed 491 tests across 71 files and the API suite passed 133 tests across 27 files, both exit 0, before the host restart. The API inventory includes session, cookie and CSRF checks. Those complete runs are recorded by conversation tool receipts; their raw logs were lost and were not reconstructed. The later change to the test transport is a named type only; its 14 coordinator tests passed again with a durable raw log.

After restart, TypeScript, e2e fixture compilation and test enumeration, lint, the production Worker and client build, the 43-operation runtime pin and api-next provenance checks, product graph, and Storybook build passed, all exit 0. The first e2e check failed because the real composer fixture imports a PNG and the e2e config omitted Vite asset declarations; adding vite/client fixed it. The first lint check rejected the test fixture anonymous mutable transport type; using a named mapped VideoTransport type fixed it. Both failed logs and successful continuations are retained. Existing lint and chunk-size warnings remain.

The local production preview passed the existing SSR/hydration gate: CSP nonce present on scripts, hydration counter updated, dialog and sign-in overlay worked, API-down feed showed an error, community creation settled as unavailable, and exactly one users/me request was observed. No sign-in or API mutation was performed. Preview and browser-proof servers and the owned Chrome process were stopped. A three-second local HLS fixture decoded at 160 by 90 with readyState 4; its grant was injected and is not Stream acceptance.

This completes the local original-audio runtime integration milestone. The reservation still expires after one hour; renewable part URLs do not extend it. Large mobile uploads, source eviction and reselection, physical camera recording, deployed persona/session compatibility, provider fixture obligations and the full capture-to-protected-playback staging proof remain open. Clean video still requires API safety approval. Song-backed guide playback and server soundtrack construction are phase two. No deployment or video enablement occurred.

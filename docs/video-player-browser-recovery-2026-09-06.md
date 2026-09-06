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
Shared source storage, multipart receipts and the upload coordinator were not
changed; participation cannot create a competing draft implementation.

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

# Posting coverage pilot evidence

This evidence binds the posting actor coverage pilot to published base
45d07cb25b3267ad16f158aa40eff7d11ad49c5e. The source-file digests in
verification.json bind the reviewed tests; the containing Git commit binds
this evidence and the coverage document.

Full bun run verify exited zero. It includes API, app, SSR, lint, generated
client provenance, runtime and icon checks, Solid UI, browser posting,
playback and hydration gates. Final focused tests and typechecking also passed
after the independent review corrections and sensitivity experiments. Worker
and app Storybook builds passed. Existing lint and Solid Doctor warnings and
simulated DOM media warnings remain visible in the logs. No dependency changed.

The first full verify stopped at lint because the new tests lacked SAFETY
comments on their type assertions. That failure is preserved in verify.log.gz;
the corrected run is verify-final.log.gz. Initial fixture typing and abort
expectation errors were corrected before the final gates.

Removing one row from each map produced three expected failures. Recording a
missing original-command signal produced one expected failure. The original
files were restored byte for byte in finally blocks before the final focused
run. These deliberate failures demonstrate gate sensitivity.

The built app Storybook sweep ran all 63 stories in the existing video
authoring and community posting modules on a task-owned local server. Every
interaction and axe result passed; 13 incomplete axe checks are recorded
separately. story-results.json keeps per-story classifications without the
large DOM payloads. The task-owned server was stopped after the sweep.

The independent reviewer accepted the corrected suites and coverage document.
The two findings concerned transient routing participation and abort assertions
being swallowed by actor error handling. Routing now checks its incoming and
outgoing edges along with actual outcome branches. Signal assertions run in
the test body after recording every received signal, outside actor callbacks.

Read ../../posting-state-coverage.md for the baseline text timeout limitation
and evidence boundaries. These checks prove local actor and fixture behavior,
not wire decoding, deployed acceptance, physical recording or synchronization.
No production source, existing story, authentication, API or HNS controller changed.
No hosted CI execution is claimed.

Use sha256sum -c SHA256SUMS from this directory to check the evidence bytes.
Decompress a log with gzip -dc <name>.log.gz. Recompute source digests with
sha256sum on the three paths in verification.json from the repository root.

# Posting actor coverage

This pilot belongs to `solid-storybook-state-coverage-map`, executed by
`workspace_state_coverage_coordinator` from published main
`45d07cb25b3267ad16f158aa40eff7d11ad49c5e`. It covers existing actors with tests
and an explicit map. It changes no production actor, controller, transport,
storage, bridge or existing story. HNS/Spaces and feed work retain their
separate custody and are not dispatched by this document.

## Coverage contract

The three coverage suites compare map keys with the real machines' state keys.
Video recursively includes its compound capture parent and children. Every
map row drives the real actor with controlled operations and checks its stable
state or, for eventless routing, the resulting branches. Pending video and song
invocations must receive an aborted signal on disposal. A missing row fails the
inventory assertion rather than silently removing its scenario.

Story names are typed against the actual story modules and checked against
their exports. This is a link to a visible projection, not evidence that a
story reached the named actor state. State evidence comes from the actor tests;
rendered component evidence comes separately from story interactions. No suite
reads another test's title or source text to infer executed behavior.

`vitest.app.config.ts` explicitly includes the video suite and includes the
text and song directories through `*.test.ts`. Existing GitHub `bun run verify`
and Radicle `test:app` therefore run all three maps without a new CI framework.

## Video

The executable map is
[`video-composer-coverage.test.ts`](../src/features/posts/video-submission/video-composer-coverage.test.ts).
Visible projections use
[`video-authoring.stories.tsx`](../src/features/posts/video-submission/video-authoring.stories.tsx).

| State path | Story or internal projection | Actor evidence |
| --- | --- | --- |
| restoring | SubmittedUploadResumes | Retained record and file resume into one submission. |
| choosingSong | ExcerptSelection | Restore without a pending record reaches selection. |
| checkingPlayback | Internal playback confirmation | Confirmation remains pending; disposal aborts it. |
| capture | RecordingReady | The capture parent is entered through idle; preview synchronization runs. |
| capture.idle | RecordingReady | Idle starts no recording and accepts preview checking. |
| capture.inspecting | Internal file inspection | Rejected inspection returns to idle with no bad file retained. |
| capture.preparingGuide | Capture loading notice | Preparation is pending before camera startup; disposal aborts it. |
| capture.startingCapture | Pending permission | Camera startup follows preparation; disposal aborts it. |
| capture.startingGuide | Guide startup | A capture session exists before guide confirmation; disposal aborts pending work. |
| capture.recording | GuidedRecording | Guide confirmation and selected soundtrack are retained. |
| capture.interrupting | GuideInterrupted | Cancellation runs once, then releases the session and records interruption. |
| capture.finalizing | RecordingStopped | Finishing runs once and preserves its file and alignment for review. |
| review | ReviewPlayback | Returning to capture discards the reviewed file. |
| submitting | UploadProgress | Repeated publish events do not launch another submission; an unposted answer is retained. |
| retained | SubmittedUploadNeedsAnotherTry | Restore retains the record without dispatching publication. |
| refreshing | SubmittedUploadResumes | A read preserves the retained record without dispatching publication. |
| startingOver | SubmittedUploadExpired | Reset releases the record and returns to selection. |

`capture` and `capture.idle` intentionally share a screen. Restoring and
refreshing intentionally share a visible resume projection, but their tests
now enter different states and assert different operations. Inspection no
longer relies on a duration-refusal test as its only mapped evidence.

Video keeps its account-scoped IndexedDB resume. The existing coordinator tests
cover exact finalize replay, retained receipts and another account refusing
the saved upload. Media and capture tests cover late completions, stream/audio
cleanup and decoder disposal. The map uses opaque media handles and proves no
physical device synchronization or real recording quality.

## Text

The executable map is
[`text-submission-coverage.test.ts`](../src/features/posts/text-submission/text-submission-coverage.test.ts).
Its visible projections use
[`community-page-posting.stories.tsx`](../src/features/communities/community-page/community-page-posting.stories.tsx).

| State | Story or internal projection | Actor evidence |
| --- | --- | --- |
| starting | Internal eventless routing | Initialization selects sending or held, without dispatch before start. |
| sending | PostsInstantly | Start dispatches the retained envelope once. |
| waiting | ConnectionLost | An ambiguous answer is not a refusal; explicit retry reuses the exact envelope. |
| signInRequired | SessionExpiredThenSignedIn | No timer dispatch while held; resume sends the same envelope. |
| published | PostsInstantly | A definitive publication settles with the returned post link. |
| rejected | Rejected | A definitive refusal settles without a published post identifier. |

Existing machine tests cover timeout, automatic exact replay and bound reads
after an idempotency conflict. Store tests distinguish expiry from sign-out,
clear preparation on sign-out and prevent another account from resuming a held
operation. Transport and dialog tests remain in `post-composer`. The accepted
v1 request lifetime remains memory-only. This pilot does not migrate the store
to the Solid actor bridge.

Disposal assertions prove that no later dispatch occurs. They do not prove
that pending HTTP requests or all timers are reclaimed. The current machine's
`withTimeout` owns a global 15-second timer and does not consume an invocation
abort signal. An unanswered attempt can retain that timer after actor stop.
Making the attempt timeout and transport cancellation invocation-owned is a
candidate for a separately authorized runtime change, with a disposal test
that measures resource release. This pilot preserves that baseline behavior.

## Song

The executable map is
[`song-observation-coverage.test.ts`](../src/features/posts/song-submission/song-observation-coverage.test.ts).
Its stories are in the same community posting module as text.

| State | Story or internal projection | Actor evidence |
| --- | --- | --- |
| starting | Internal eventless routing | Held input suspends observation; a terminal outcome remains settled. |
| routing | Internal server-outcome projection | Processing, review, author action, failure and final outcomes choose the appropriate branch. |
| waiting | SongMovesThroughItsStages | Observation delay starts one read. |
| reading | SongStatusUnanswered | A deadline aborts the read, preserves the known outcome and ignores late publication. |
| waitingForAuthor | SongNeedsOriginal | Slower polling continues without dispatching an author command. |
| bindingOriginal | SongOriginalUnanswered | One original command retains its link; unanswered completion leads to a read and ignores late command output. |
| rerunning | SongProcessingFailedThenRerun | One rerun leads to observation after a timeout, without command replay. |
| held | Internal session suspension | No polling while held; resume reads, and pause aborts that read without adopting its late answer. |
| settled | SongMovesThroughItsStages | Terminal publication stops observation. |

These are observer states, not new server status enums. Fixtures exercise the
existing projection and are not generated-client decoding or wire-validation
evidence. Store tests cover full phase progression, bounded reads, uncertain
original recovery, final failures and session/account clearing. Song's accepted
v1 observer lifetime remains memory-only and its store still creates actors
directly.

## Maintaining the pilot

Change a map when its actor changes, with an operation-driven scenario that
would fail if the actor stops reaching the required behavior. Add a visible
story only when there is a distinct useful screen. Keep internal reasons
specific and keep transient routing out of user-facing state labels. A map is
state coverage, not exhaustive coverage of every event, guard or concurrent
execution.

The existing machines are a sensible boundary for retries, interruption and
asynchronous ownership. A new framework or general controller rewrite would
not improve this pilot. Future runtime changes should resolve a demonstrated
ownership or recovery defect, preserve server authority and retain one owner
per operation. Simple UI toggles do not require actors.

## Verification, 2026-10-13

The independent review accepted the corrected pilot. Full `bun run verify`,
Worker build and app Storybook build passed. Final focused posting tests passed
498 tests across 34 files; full app verification passed 1,788 tests. The map
suites supply 35 cases covering 32 state paths, including their inventories.
Final typechecking passed after review corrections and restored sensitivity
experiments.

Removing one row from each map failed all three inventory tests. Removing the
received original-command signal failed the binding scenario. Both experiments
restored the original source before final verification.

All 63 existing posting stories passed the built Storybook interaction and axe
sweep. Axe reported 13 incomplete checks separately from violations. This is
local component evidence, not deployed or physical-device acceptance. Source
digests, compact per-story results, failure probes and verification logs are
kept in [the evidence package](evidence/posting-state-coverage-2026-10-13/README.md).

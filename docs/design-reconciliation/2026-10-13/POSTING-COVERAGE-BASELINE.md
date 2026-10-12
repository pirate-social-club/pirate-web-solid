# Posting coverage baseline

This read-only source review is owned by the workstation `workspace_state_coverage_coordinator` under `solid-storybook-state-coverage-map`. It checked Solid `45d07cb25b3267ad16f158aa40eff7d11ad49c5e`. No test, build or rendered Storybook check ran. [source-review.json](source-review.json) records syntax-based state inventories and the duplicate-feed import trace.

## Existing video coverage

`src/features/posts/video-submission/video-composer-coverage.test.ts` already maps all 17 state paths. Its state-key assertion compares the map to the real machine. It checks declared story exports and named test fragments, with explicit reasons for states it treats as internal. The following table is the existing mapping, not new coverage or an execution result.

| Machine path | Story or internal reason | Named transition-test fragment |
| --- | --- | --- |
| `restoring` | `SubmittedUploadResumes` | resumes on its own |
| `choosingSong` | `ExcerptSelection` | the excerpt is chosen before any clip |
| `checkingPlayback` | Transient playback check shown by Continue | changing the song while playback is checked |
| `capture` | `RecordingReady` | the camera shows on the capture screen |
| `capture.idle` | `RecordingReady` | the camera shows on the capture screen |
| `capture.inspecting` | File inspection has no stable screen | an uploaded 16 second video is refused |
| `capture.preparingGuide` | Guide buffer wait has a loading notice | the complete local guide precedes capture |
| `capture.startingCapture` | Camera permission is pending | hiding the page while capture opens |
| `capture.startingGuide` | Guide startup is pending | Stop during guide startup aborts the guide |
| `capture.recording` | `GuidedRecording` | recording plays the guide |
| `capture.interrupting` | `GuideInterrupted` | a real guide gap discards the take |
| `capture.finalizing` | `RecordingStopped` | after Stop the capture screen says the take is being finished |
| `review` | `ReviewPlayback` | review plays the intended soundtrack locally |
| `submitting` | `UploadProgress` | reserves, uploads and finalizes |
| `retained` | `SubmittedUploadNeedsAnotherTry` | a failed upload offers one retry action |
| `refreshing` | `SubmittedUploadResumes` | an unconfirmed finalize goes Home |
| `startingOver` | `SubmittedUploadExpired` | Start over cancels an expired upload |

Source analysis confirms all 17 machine paths match the map and every referenced story export and transition-test fragment exists in its named source. Test-name fragments and exported stories establish inventory linkage; they do not prove a transition test executed, a story visually matched, or a fixture drove the exact state. The stories use simulated media and do not establish real camera timing or device synchronization.

Review the existing assertions before adding infrastructure. In particular, decide whether guide loading and camera-permission waits deserve stable pending stories rather than internal-only reasons. Verify test discovery and state-specific behavior. Avoid creating another registry beside this one or accepting substring presence as sufficient behavioral evidence.

## Text and song follow-ups

| Actor | Actual state paths | Existing test sources to inspect |
| --- | --- | --- |
| Text | `starting`, `sending`, `waiting`, `signInRequired`, `published`, `rejected` | `text-submission-machine.test.ts`, `text-submission-store.test.ts`, `session-recovery-drafts.test.tsx` |
| Song observer | `starting`, `routing`, `waiting`, `reading`, `waitingForAuthor`, `bindingOriginal`, `rerunning`, `held`, `settled` | `song-submission-store.test.ts`, `original-song-link.test.ts` |

The next inventory should link these state paths to actual visible projections and component stories, including transient-state reasons. Text machine tests already name exact-request replay, ambiguous response, pause/resume and definitive refusal cases. Song store tests name unanswered reads, bounded requests, original-reference uncertainty, processing retry and account/session cleanup. Those files were inspected as source; no passing test or exhaustive map is claimed for them here.

Preserve the accepted v1 ownership and persistence boundaries. Local actor state and server submission outcomes are different axes. Do not rewrite posting, add storage or dispatch another operation merely to make the inventory look complete. Source implementation requires this task's governed worktree admission and appropriate tests; this baseline alone does not activate it.

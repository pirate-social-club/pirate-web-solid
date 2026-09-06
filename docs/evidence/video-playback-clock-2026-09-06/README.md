# Playback clock and viewer-copy correction

This corrects two missed integration defects from e943a9ce. Neither was an accepted deferral: the integration review missed the strict client-clock assumption and uploader-only copy on the shared viewer surface. Existing tests had enforced the former assumption.

Grant validation now tolerates at most sixty seconds of future clock skew, caps the local lifetime at five minutes, and retains the existing URL, expiration and timestamp-order checks. Already-due renewal waits at least ten seconds; if expiration comes first, the player stops instead. Stream retains authority over signed-token expiry. The pending paragraph is viewer-neutral.

An independent read-only review found no blocker in the four-file change, including timer ordering and the existing player generation fence. Focused access/player/feed/Post tests report 5 files and 45 tests passed in focused.log; the process receipt was unavailable after session resumption, so this evidence cites the completed test summary rather than inventing its exit status. The full application gate subsequently passed 71 files and 498 tests, exit 0. Type checking, lint, Worker build (including runtime and client provenance checks), frozen installation and git diff --check each returned exit 0. Lint warnings, build chunk warnings and simulated-browser unimplemented-media notices remain in the logs.

Commands used bun run test:app with --maxWorkers=1, bun run tsc --noEmit -p tsconfig.json, bun run lint and bun run build. Gates ran serially at low CPU and I/O priority. Dependencies, session/CSRF code, API contracts and component structure were unchanged; separate API, Storybook, dependency-audit and browser/live-provider gates were not repeated for this focused correction.

These are local regression checks, not real-device or live Stream evidence. No deployment, flag change, credential mutation, provider job or reservation-lifetime ratification occurred. Original-audio staging remains subject to the existing proof checklist; chosen-song dance publication is a separate phase.

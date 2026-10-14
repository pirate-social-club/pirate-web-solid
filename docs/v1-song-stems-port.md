# Required song stems v1 port

Base: `f668c090e00b1a5792406075476620aad49f8890` (Solid main).
Source: [`344e44b6a65d56d6865626bee583ef5727ac1464`](https://github.com/pirate-social-club/pirate-web-solid/commit/344e44b6a65d56d6865626bee583ef5727ac1464), preserved at `source/v1-song-stems-344e44b6`.

Selected source hunks were applied to the base, then reconciled with its current
contracts and cancellation behavior. No preserved branch was rebased and no old
file was restored wholesale. The selected source patch has SHA-256
`2caf9839545ce1d1bb12a13061f8f4b9198679b5d832f5493484eec360c726be`.
Reproduce it with `git diff 344e44b6^ 344e44b6 --` and these eight paths:

- `src/features/posts/media-submission/contracts.ts`
- `src/features/posts/media-submission/coordinator.ts`
- `src/features/posts/media-submission/coordinator.test.ts`
- `src/features/posts/media-submission/transport.ts`
- `src/features/posts/post-composer/media-composer-bridge.ts`
- `src/features/posts/post-composer/song-step.tsx`
- `src/features/posts/post-composer/create-post-dialog.test.tsx`
- `src/features/posts/post-composer/create-post-dialog.stories.tsx`

The final port requires Instrumental and Vocals before Continue. Preparation
means primary audio is sealed and both stems are authoritatively attached.
Retries read server state, skip attached stems, and replay an uncertain
attachment with its retained generated input and idempotency key. A delayed
attachment response can settle through an authoritative read. Interrupted
reservations and uploads restart with new reservations; attempts remain in
memory for the composer session and add no persisted command or machine states.

Paper [PR #72](https://github.com/pirate-social-club/pirate-web-solid/pull/72)
at `78e9a92a08a5f4511795db520731d2e020126087` changes the overlapping
Song-step label and composer stories from “Lyrics (optional)” to “Lyrics”.
Those hunks are preserved. Other Paper changes remain owned by that PR.

API client `0.114.0-a2eb47a5`, `package.json`, `bun.lock`, the client archive,
`api-client-provenance.json`, and the runtime-table gate remain the base's exact
files. The source's 0.90.0 dependency, archive, provenance and gate changes are
excluded. Existing lyrics, terms, session/CSRF writes and opaque upload behavior
continue through the current client. Local publication and browser fixtures now
provide stems; synthetic e2e audio exercises the storage contract.

Acceptance evidence belongs to the PR's exact head and GitHub checks. Runtime
acceptance still needs the coordinator's reviewed release after the staging
freeze, authenticated browser uploads of real primary audio and matching stems,
and downstream Karaoke/Study checks. This lane adds no migrations, generated
client changes, deployments or Rewards activation.

The PR #74 follow-up merges current main
`193bfea714622b8cc008814c2da60f6a88c71794` into its existing feature branch,
after first reconciling `784c97820ecd20617b3f9bef40b97a161370457d`.
An uncertain attachment retains both its original `File` and generated command;
that stem's selection and removal stay locked until a sealed read or a
definitive refusal resolves it. Retry reuses the command and upload reservation.
Observation reads have a 15-second deadline, and a completed finalize or stem
POST wins over an outstanding read. Cancelled or late reads cannot overwrite
the completed result. These attempts remain in memory for the dialog only.

Unit, composer, story and local browser stem fixtures preserve
`creation_revision` on attachment, matching the API contract. Focused tests
cover both stem locks, attempted replacement/removal, exact-command replay,
definitive refusal, and finalize/stem POST success during a hung GET.

# Local Study/Karaoke browser harness

This directory drives the real Solid application through real Study and Karaoke
journeys against the local api-next harness Worker and a disposable PostgreSQL.
Only the external provider transport is replaced (scripted Study transcripts and
a scripted Karaoke streaming STT adapter); session state, grading, persistence,
completion and duplicate-effect protection are the production implementations.

Nothing here contacts a live provider, staging or production. The audio is
generated locally and the synthetic identities are seeded by the api-next
harness.

## Prerequisites

1. From the api-next harness worktree
   (`<workspace>/.worktrees/api-next/api-study-karaoke-local-provider-seam/tests/study-karaoke-harness`):

   ```sh
   ./reset-local-db.sh          # disposable PostgreSQL 17, 1 CPU / 512 MB
   cd ../../.. && bun tests/study-karaoke-harness/seed.ts
   ./tests/study-karaoke-harness/start-local.sh   # Worker on 127.0.0.1:8788
   ```

2. From this worktree, serve the **built** application. The Vite dev server
   serves hydration scripts that its nonce-based Content-Security-Policy blocks,
   so the browser harness runs against the production-shaped build:

   ```sh
   bun run build
   bun x vite preview --host 127.0.0.1 --port 8787
   ```

3. `STUDY_KARAOKE_HARNESS_MANIFEST` may point at the api-next
   `tests/study-karaoke-harness/.local/harness.json`; the default resolves the
   sibling worktree layout under `.worktrees/`.

## Running

```sh
bun x playwright test -c e2e/study-karaoke-harness.config.ts
```

One Chromium worker, no shards. The `chromium` project uses a tone fake
microphone; the `chromium-silent` project runs the `@silent-audio` no-vocal case
with a silent capture file. The global setup generates the WAVs under `.tmp/`
and `public/harness/` (gitignored).

Reruns need a fixture reset (the Study review schedule is consumed per account):

```sh
<api-next harness>/reset-local-data.sh
```

## Journeys and assertions

Each test owns a distinct synthetic account, so spaced-repetition scheduling
and completion effects stay isolated.

- Study: a full say-it-back lesson with persisted session, attempts, grading,
  completion and exactly one Study qualification; wrong words with a returned
  miss; an omitted negation with the missing token persisted; a duplicated
  submission (the same answer request sent twice) and a reload that leave one
  persisted attempt; and a denied microphone that persists no attempt.
- Karaoke: a full scored take with all five line scores, the final score and
  one completion effect; wrong words with a persisted low score; a silent take
  persisted as five unrecognized lines; early and late delivery reflected in
  the persisted timing diagnostics; and a mid-take disconnect with no duplicate
  completion effect.

Row-level assertions read the disposable PostgreSQL directly through `psql`
(the operator path), never screen state alone. The console output records the
presentation findings separately: line highlighting, token (word)
highlighting, timing calibration numbers, and line/final scores.

## Local browser accommodations

Two browser-boundary adjustments are needed locally; both are reported as
findings in the harness handoff rather than silently repaired here:

- The document Content-Security-Policy does not list the api-next origin that
  `/karaoke/realtime` WebSocket URLs point at, so the scored-take socket is
  blocked. `relaxDocumentCspForHarness` strips the policy header for the local
  document only.
- Chromium 138+ blocks a loopback document's WebSocket to another loopback port
  with `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`. The harness launch disables
  that check for its local browser only.

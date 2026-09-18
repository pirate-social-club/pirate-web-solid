# Local Study/Karaoke browser harness

This directory drives the real Solid application through real Study and Karaoke
journeys against a local api-next harness Worker and a disposable PostgreSQL.
Only the external provider transport is replaced (scripted Study transcripts and
a scripted Karaoke streaming STT adapter); session state, grading, persistence,
completion and duplicate-effect protection are the production implementations.

Nothing here contacts a live provider, staging or production. The audio is
generated locally and the synthetic identities are seeded by the api-next
harness.

## Prerequisites

1. The api-next harness database, worker and fixture:

   ```sh
   cd <workspace>/.worktrees/api-next/api-study-karaoke-local-provider-seam/tests/study-karaoke-harness
   ./reset-local-db.sh      # one disposable PostgreSQL 17, 1 CPU / 512 MB
   cd ../../.. && bun tests/study-karaoke-harness/seed.ts
   ./tests/study-karaoke-harness/start-local.sh   # foreground Worker on 127.0.0.1:8788
   ```

2. The Solid dev server on 127.0.0.1:8787 (from this worktree):

   ```sh
   bun run dev -- --host 127.0.0.1 --port 8787
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

## What the specs assert

- Study: a full say-it-back lesson with persisted session, attempts, grading,
  completion and exactly one Study qualification; wrong words, an omitted
  negation, duplicate submission replay, page reload and denied microphone.
- Karaoke: a full scored take with persisted line scores and one completion
  effect, wrong words, a silent take, early/late timing diagnostics and a
  mid-take disconnect. Row-level assertions read the disposable PostgreSQL
  directly through `psql` (the operator path), never screen state alone.

The console output records the presentation findings separately: line
highlighting, token (word) highlighting, timing calibration numbers, and
line/final scores.

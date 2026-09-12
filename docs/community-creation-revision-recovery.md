# Saved community creation revision recovery

A saved form could hold revision 2, refresh the intent to revision 3, and then
PATCH the edited draft with expected revision 2. The repository correctly
rejected that request. The controller now uses the refreshed intent identifier
and revision, keeps the user's draft, and commits the revision returned by the
successful PATCH.

Update idempotency keys include that expected revision. A transport retry of
an unchanged draft at the same revision keeps its key. A retry after another
writer advances the intent, or after a successful PATCH loses its response,
uses a different key because its request body has changed. Editing the draft
continues to rotate the underlying update key. A further race can still return
409; the form keeps the edits and offers an explicit retry rather than looping.
If refresh finds a committed resource, it navigates there without another write.

Five controller regressions cover refreshing before PATCH, losing a race after
refresh, losing the response to a successful PATCH, retrying an unchanged
revision after a transport failure, and discovering an already committed
community while local edits are present. They import the real controller and
use its existing API, session-resolution and navigation seams. They do not
replace modules, seed business state, or establish a live browser result.

The first new regression failed against the unchanged controller from 4cb1d58
with expected revision 3 and received revision 2. That focused run deliberately
selected one test and skipped the other 41. After the fix, all 51 tests in the
creation controller and API adapter suites pass without skips. The jsdom log
retains its existing unimplemented scroll and document-navigation notices.

Install the frozen dependencies as described in [the E2E README](../e2e/README.md).
From the repository root, rerun the focused suite with:

```sh
bun run test:app --maxWorkers=1 --no-file-parallelism \
  src/features/community/community-creation-route-view.test.tsx \
  src/features/community/community-creation-api.test.ts
```

The run used a systemd user scope limited to 50% of one CPU, 1 GiB memory and
zero swap, with one Vitest worker and one Rayon thread. No browser, server,
application build, backend test suite, deployment or live mutation was run.
The required credentialed creation journey remains pending independently of
these regressions. Repository separation and future zk gates are unchanged.

The app-wide `tsc --noEmit -p tsconfig.json` attempt returned 134 at the
768 MiB JavaScript heap limit: "Allocation failed - JavaScript heap out of
memory". That is an incomplete app-wide check. The memory limit was retained;
no application type-check pass is claimed for that command.

For the narrower type check, create `.tmp/tsconfig-community-revision.json`
with the following contents, then run
`bun run tsc --noEmit -p .tmp/tsconfig-community-revision.json`. This checks the
changed controller and its tests with their imports and ambient declarations.
It is distinct from the app-wide check.

```json
{
  "extends": "../tsconfig.json",
  "include": [
    "../src/features/community/community-creation-route-view.tsx",
    "../src/features/community/community-creation-route-view.test.tsx",
    "../src/vite-env.d.ts",
    "../worker-configuration.d.ts"
  ]
}
```

The narrower type check returned zero. Changed-file oxlint also returned zero,
with eight existing warnings in unchanged error parsing and session guards;
no warning points to the revision fix or new regressions. The installed E2E
helper, type/discovery and lint reruns are recorded separately in
[the browser foundation note](community-creation-browser-foundation.md).

# Saved community creation revision recovery

A saved form could hold revision 2, refresh the intent to revision 3, and then
PATCH the edited draft with expected revision 2. The repository correctly
rejected that request. The controller now uses the refreshed intent identifier
and revision, keeps the user's draft, and commits the revision returned by the
successful PATCH.

Update idempotency keys include that expected revision. A transport retry of
an unchanged draft at the same revision keeps its key. A retry that still needs PATCH after another writer advances the intent
uses a different key because its request body has changed. When refresh finds
the complete local draft already saved, the conflict-policy follow-up below
continues without another PATCH. Editing the draft
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
selected one test and skipped the other 41. After the initial fix in 64c3297, all 51 tests in the
creation controller and API adapter suites passed without skips. The jsdom log
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

## Remote draft conflict policy

The review of 64c3297 identified a remaining silent-overwrite case: refreshing
the revision alone allowed a local full-draft PATCH to replace another tab's
saved draft. That was not an accepted last-writer-wins decision. The follow-up
uses a conservative policy: a remote draft change stops submission and preserves
local input. A revision advance with unchanged draft fields can still proceed.

The controller retains the saved draft from when local editing began. Session
refreshes and polling may advance the intent revision but cannot replace that
editing baseline. Comparison covers every field sent by PATCH, including the
persona and policy fields that are locked in the current form. Public-name
comparison follows the API adapter's trimming and create-new-persona rules.
Object key order does not matter. The exhaustive field map requires an explicit
comparison decision when CreateCommunityDraft gains another field; this does
not add any new gate support.

After detecting a conflict, Create stays disabled across repeated submissions,
further local edits and session refreshes. The operator can copy local input,
then choose "Discard my edits and load saved setup". Only a successful read
replaces the local draft; a failed read leaves the input and conflict intact.
The newly loaded draft becomes the baseline for later edits. No merge or
force-overwrite action is provided.

If the server already contains the complete local draft after a lost PATCH
response, the controller adopts that saved revision and continues without
another PATCH. If a saved draft has changed again after that lost response,
the controller cannot infer authorship and conservatively requires review.
An already committed resource still navigates without another write.

The follow-up tests cover remote edits to all five draft fields, a remote edit
discovered after a 409, background refresh, repeated submit and further edits,
sign-out/sign-in, failed then successful explicit reload, and an actual saved
draft after a lost PATCH response. The lifecycle-only test also reconstructs
the object in a different property order. Conflict state clears on sign-out
so sign-in remains usable, while the editing baseline remains available for
comparison after the original account returns.

The controller and API adapter suites run with one thread worker:

```sh
bun run test:app --pool=threads --maxWorkers=1 --no-file-parallelism \
  src/features/community/community-creation-route-view.test.tsx \
  src/features/community/community-creation-api.test.ts
```

The red run executed the five remote-field cases against 64c3297; all five
failed. An earlier, narrower name filter selected no tests (49 skipped), so
it was not counted as a regression run. The first combined verification passed
the nine API tests but failed to start the controller worker under host
contention. A subsequent controller run exposed two tests issuing input and
click events without waiting for the controlled field to settle. Those tests
now wait for enabled inputs and rendered values before the next action.
The final run passes all 61 tests without skips and retains the existing
jsdom scroll and document-navigation notices. The logs preserve these unsuccessful attempts.

No app-wide type-check retry, live browser journey or cleanup steps 3 through 5
is included in this conflict-policy follow-up. Their earlier open status is
unchanged. The policy is a reviewable local change, not a merge or deployment.

If a refresh detects a remote edit while PATCH is already in flight, its later
response cannot clear the conflict or continue to commit. A deferred-response
regression checks that the local input remains available and no commit occurs.

The follow-up focused type check also returns zero using the configuration
above, including the imported draft comparison helper. Final changed-file lint
returns zero with the same eight existing warnings. Tests and focused types
ran serially with a 1 GiB memory cap, zero swap, and 50% of one CPU; lint used
256 MiB and 25% CPU. Core dumps were disabled. The full app type check remains
incomplete; this focused pass does not replace it. Installed dependencies
remain in the worktree so these results can be independently reproduced.

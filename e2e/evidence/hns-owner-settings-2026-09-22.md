# Staging owner-settings readback

Test source starts at Solid 3edc151ce358dff525c5d0a7e6042d66441d9619.
The approved staging owner account signed in through the maintained Privy
fixture on https://web-next-staging.pirate.sc. No credential, token or cookie
is retained in this receipt. This is staging evidence, not production evidence.

The existing community discovered by membership and owner-capability reads was
community_b37e2a01-8a18-4eec-bc40-194d1a121c2c. Its moderation capability read,
handle-sales management context, sale-namespace list and offering list each
returned 200. HNS root-import discovery returned 404. Direct navigation and
reload of its namespace settings each returned document status 200, with no
route-level denial but with the namespace-denied panel present. The browser
write guard observed zero attempted product writes. No community was created.

The combined live run passed seven tests, failed the explicit HNS diagnostic
and skipped the existing feed-hydration test because its fixture variable was
absent. A second HNS-only run confirmed the endpoint and both page outcomes.
Keep the HNS assertion failing; do not reinterpret disabled or unavailable HNS
as successful onboarding. Staging configuration/authority qualification is
required before import or full chain/DNS acceptance can proceed.

Thirty-one offline E2E-helper tests passed, including three new narrow
anonymous-probe tests. Focused lint, diff whitespace checks and discovery of
57 tests passed. check:e2e typechecking failed in unchanged song code against
the baseline's vendored API client 0.87.0: missing
ListActiveSongMediaPostSubmissionsResponse and
get_communitiesCommunityIdMediaPostSubmissions, with related implicit-any
errors. These changes do not repair that separate generated-client mismatch.

The smoke correction accepts persona 401 only alongside an account-probe 401.
It does not exempt other methods, endpoints, forbidden responses or server
failures. Full regtest/DNS/gateway onboarding and the production 0qcm incident
remain unproven. No deployment or wallet operation was performed.

Follow-up correction. The typecheck failure above was an installed dependency
mismatch, not missing exports in the committed artifact. The tarball and
recorded client digest are
c9290fa02294aaac96d5cb3b180bbd03e5194dd784ce7f2e8dd02039c1a9eee6;
the first cached install produced
11c8711347978e7dc6dfa56c13981c54528ca95d5022033849253558210000b1.
A forced frozen install with a fresh isolated Bun cache restored the recorded
digest without changing the artifact, package version or lockfile. Provenance,
runtime tables and check:e2e then passed. Do not repair main's contracts based
on the superseded diagnosis. The task-created temporary cache was removed after
the install; shared caches and other worktrees were left untouched.

The revised default staging smoke run passed seven tests without skips. It
does not include HNS or hydration acceptance. The dedicated hydration command
now fails with a clear missing-fixture error instead of skipping; its negative
run failed as expected before exercising the browser journey. Thirty-three
helper tests passed. Read-only membership discovery completed all pages and
found one community for the approved staging owner; its public threads feed
returned 200 with zero items. Two historical fixture names returned 404 with
the maintained feed query. No content was created to make the test pass.

Full repository verification passed the corrected typechecks, 33 helper tests,
application tests (1,003), SSR tests (21), design-system tests (417), provenance
and runtime tables. It later failed in unchanged text-post-check.mjs at line
317: the Publish post locator timed out during click after scrolling began.
The overall verify command is therefore not green; song-post-check, which
comes after that command, was not reached by this run.

The isolated text-post-check rerun passed all five scenarios: published,
manual_review, blocked, typed_conflict and lost_response_replay, including exact
replay and proxy assertions. This records a successful rerun, not an erasure of
the earlier full-run timeout.

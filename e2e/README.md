# Staging end-to-end suite

This suite replaces ad-hoc staging clicks with repeatable Playwright evidence.
It defaults to `https://web-next-staging.pirate.sc`, runs one Chromium worker,
and keeps traces only when a test fails. Override the origin with
`E2E_BASE_URL` for an explicitly prepared local preview.

`bun run test:e2e` and `bun run test:e2e:staging` run only tests tagged
`@staging-readonly`. Authenticated tests read `E2E_PRIVY_EMAIL` and
`E2E_PRIVY_OTP` from the process environment. Credentials must come from an
authorized secret runner or a git-ignored local `.env`; never place them in a
script, source file, commit, trace, or bundle.

Tests tagged `@staging-mutating` are excluded from the default gate and also
skip unless `E2E_ALLOW_MUTATION=1`. Run them explicitly with
`bun run test:e2e:staging:mutating`. The Very scan-boundary test additionally
requires `E2E_VERY_JOIN_COMMUNITY_ID` naming a Very-gated community that the
E2E account has not joined. It creates the proof and bridge sessions, proves
that the pinned widget and QR render, then closes the widget before any palm
scan. A physical palm remains a manual release boundary.

The post-rejection spec uses
`community-very-staging-fixture-acceptance-v1` by default, or
`E2E_VERY_FIXTURE_COMMUNITY_ID` when provided. That fixture has no HNS route
authority by design. Its POST must return the sanitized `404 not_found`
contract, and the client must offer `Discard and edit` without entering a
retry loop.

The text and song posting specs drive the community page's own `Post here`
action, which is the surface a member uses, rather than the global entry with a
raw community identifier. Both read `E2E_COMMUNITY_PATH_SEGMENT`, naming a
staging community this account belongs to with an active persona, and skip with
a visible reason without it. The song spec publishes real audio into the
configured object store and asserts exactly one publication, no lyrics command
for an instrumental, and the post appearing in the feed; it is the only
evidence that the deployed API, storage and processing accept a song, because
the local `song-post-check` supplies its own responses.

The earlier successful post spec skipped with a visible reason until the HNS
lane supplied `E2E_ROUTE_AUTHORIZED_COMMUNITY_ID`. It does not enable HNS and must
never use the Very ceremony fixture. The API currently exposes no post-delete
contract, so an explicit run leaves uniquely marked staging content and
records a cleanup annotation.

After one authorized physical scan, run the separately tagged read-only
membership assertion with `E2E_ALLOW_MANUAL_VERIFY=1` and
`bun run test:e2e:staging:manual`. This is once-per-release evidence, not a
per-commit gate.

An authorized staging publish is incomplete until the publisher injects the
staging test-account environment and runs `bun run test:e2e:staging` against
the resulting deployment. Mutating and manual tags are never part of that
automatic post-publish check.

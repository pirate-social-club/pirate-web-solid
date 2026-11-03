# Pirate Web Solid — Agent Rules

## Authoritative product boundary

This repository is the standalone Pirate SolidJS application. Together with
`api-next`, it is one of the only two target product systems. It owns its
source, packages, dependency graph, Worker entrypoint, configuration, CI,
release workflow, and deployment.

No production code, configuration, contract, test fixture, or deployment may
depend on the React application, the legacy API, or their repositories. Reject
dual-write, old/new token interoperability, legacy JWKS trust, legacy response
compatibility, request-level fallback, strangler dispatch, route allowlists,
shared service bindings, compatibility shims, and localStorage authentication.

Historical repositories may be inspected read-only. Framework-pure Solid
components, stories, tests, assets, and generic security/platform helpers may
be copied after dependency review; copied code becomes owned here and must not
retain workspace links, imports, runtime calls, or deployment coupling to its
source.

## Runtime

- The public Worker directly owns all Solid routes. There is no outer React
  dispatcher and no React fallback.
- The only product API is api-next. Staging uses
  `https://api-next-staging.pirate.sc`; never use `api-staging.pirate.sc` as a
  product origin or JWKS source.
- Authentication is direct between this app and api-next through an HttpOnly,
  Secure, host-only session cookie. Writes require exact Origin and CSRF
  protection. Never persist application bearer tokens in localStorage.
- Secrets are bindings, never source or checked-in configuration. No deploy,
  binding mutation, secret provisioning, or remote push without explicit human
  authorization.
- Staging deploys use `bun run deploy:staging:hns-guarded` from published `main`.
  The reviewed frozen-source mode of that same command may instead prepare
  exact published-main-ancestor website source2df in a fresh owned export,
  using --prepare-frozen /tmp/pirate-v1-solid-staging-<32hex>, then install or
  recover the exact retained staging package through --deploy-frozen with
  that same path. Its tooling and retained source must pass the existing
  accepted-source preflight. The qualified source and dependencies are mounted
  read-only; only the new export/output root is writable. The staging package
  has its own artifact identity and never overwrites or retargets the frozen
  production artifact or canonical staging dist. The ordinary published-main
  mode remains unchanged. Both modes retain the same gateway/source/built
  fingerprint checks and direct and HNS post-check behavior.
  The command reads the active staging gateway manifest, checks the source and
  built Worker ingress fingerprints and gateway references. Direct staging app,
  bundle and API checks are required after deployment. Live 8s28 serving and
  browser checks are reported separately and do not block staging Rewards
  releases. Explicit `check:staging:hns-route` acceptance still requires them
  to pass. Production checks are unchanged. Do not bypass it with a
  direct Wrangler deploy. A planned gateway rotation must update the active
  manifest and Worker reference together before the command can pass.
The fixed posting staging modes preserve accepted app2c4 and its genuine client142.
Use the maintained deploy command with `--prepare-posting-frozen
/tmp/pirate-posting-staging-<32hex>` to export and build that exact tree under
actual read-only source/dependency mounts. Keep the whole genuine2f275/beb
production output at `.tmp/build/posting-staging-production-2c4/dist` before
changing the owned tooling checkout. Preparation validates only the exact
reviewed future34f/ca8947 native manifest offline and records installed=false;
it requires no gateway switch or host/database/provider credentials.
The tooling release must retain the exact selected workspace UI tree because
its dependency symlink resolves outside the exported app. A later main UI tree
is refused even when package manifests match; select the accepted tooling
feature ancestor on its published release ref after normal integration.
Posting postchecks use only the tooling checkout's `.playwright-browsers`
cache and verify that its pinned Chromium exists before deployment. The build
environment stays separate and sanitized; no ambient browser-cache fallback
is used by these posting modes.

Use `--deploy-posting-frozen` or `--check-posting-frozen-release` with the same
private prepared directory only after the matched release is reviewed. These
modes recheck source, dependencies, retained production bytes, receipt and built
artifact, require the actual live gateway to match immediately before upload,
and retain direct plus full HNS release checks. Offline preparation is never
live readiness. Normal and historical frozen modes and production paths remain
unchanged. No arbitrary source, gateway or fixture-origin selector is admitted.

- Production HNS releases use `bun run prepare:production:hns-guarded
  /absolute/candidate-manifest.json` from published `main`, or a frozen
  `release/production-*` ref published to the repository's coordinator Radicle
  namespace whose exact commit is already accepted on published GitHub main, before the
  gateway rotation. This builds and pins the exact Worker bytes against the
  reviewed candidate manifest without sending traffic. After the coordinated
  gateway rotation and explicit deployment approval, use
  `bun run deploy:production:hns-guarded`; it checks the active gateway,
  prepared bytes, source and Worker references before deploying. Do not run a
  direct production Wrangler deploy for this release.

The owner-directed pirate.sc-only V1 release defers HNS. Use
`bun run prepare:production:website` for published-source website artifact
preparation and `bun run check:production:website` to verify its retained
receipt and bytes. Website preparation accepts exact published GitHub main or
a frozen release/production-* branch published on GitHub whose commit is
already accepted on GitHub main. It does not require the HNS Radicle namespace.
This build disables only the two HNS activation flags and
retains reserved ingress origins/routes so Worker-dispatched HNS requests
refuse. CI exercises the actual production build and flattened configuration
through `check:production:website-build`. These commands contain no upload
path. Actual website deployment requires the independently reviewed whole
release executor, current production facts and ordinary-host recovery; direct
Wrangler production deployment is not authorized by artifact preparation.
The existing HNS release procedure remains separate.

A website-only correction on an unchanged backend uses
`node scripts/production-website-hotfix.mjs`, chosen by the workspace_owner on
2026-11-02 because the whole release executor is bound to the November 1
migration and its spent attempt. It takes the exact source, artifact, receipt
and baseline version as arguments. Run `snapshot` first, then `apply`, which
makes one upload behind an exclusive marker and verifies compiled module bytes
and every hashed client file. `verify` repeats that read-only against the
recorded attempt, and `rollback` returns traffic to the named baseline. It
refuses any binding, setting or domain change it can observe. It cannot detect
that a change needs the backend or database, so the operator must not use it
for one. Independent review of the exact candidate and required CI still apply.

### Home route session upgrade

The `/` route is public-first: it renders the vertical public video discovery
surface immediately, then resolves the host-only api-next session cookie in the
browser. A successful resolution swaps its loader to the authenticated home
feed; while resolution is pending, after an anonymous result, or after a
resolution error, the public surface remains visible. The public loader must
stay credential-free and the authenticated loader must use the existing
`GetHomeFeed` contract with same-origin credentials. The product host may
project only playable video items from those responses and must fail honestly
when the API omits playable media. This is an intentional route-level upgrade,
not an authentication, cursor, or API compatibility change.

## Change policy

- One writer per worktree. Feature work uses named branches and linked
  worktrees; the canonical checkout is integration-owned.
- Every non-coordinator agent or Codex session must be launched with filesystem
  write scope restricted to its assigned linked worktree; expose the canonical
  checkout read-only. Only the integration coordinator may receive canonical
  write scope, and a session's launch directory does not establish ownership.
- The only active workspace root is
  `/media/t42/codedrive/Code/pirate-workspace`. The similarly named
  `/home/t42/Documents/pirate-workspace` tree is historical reference material,
  never a task root or write target.
- Preserve the pre-clean-slate tree at
  `refs/archive/pre-clean-slate-20260818`; do not rewrite or delete it.
- For the transferred cloud staging journey, `cloud/naming-karaoke-20261012`
  and its explicitly assigned guest UI successor publish named feature branches
  to GitHub and integrate through protected pull requests. This scoped route
  is authorized by the workspace owner in
  https://github.com/pirate-social-club/api-next/issues/595#issuecomment-6126612932.
  Before acceptance, enforce current GitHub Actions checks and PR review on
  `main`; preserve the accepted Naming/Karaoke histories with a normal merge,
  never squash or rebase them. Direct `main` pushes and force pushes are
  prohibited. Radicle signatures, workstation keys and bundle round-trips are
  not prerequisites for these cloud lanes. Existing Radicle histories, private
  local holds and unrelated release pins remain preserved.
- The historical Radicle publication route remains outside that cloud scope.
  Its `scripts/configure-radicle-primary` and `scripts/publish-main` helpers
  must not bypass the cloud pull-request route. Keep the GitHub fetch URL;
  change a clone-local origin push guard only when needed for its authorized
  named feature branch. Source acceptance does not authorize deployment,
  feature activation, credentials or funded operations; production is paused.
- Import work in reviewable tranches with a source manifest and hash evidence.
  Exclude React, dispatcher, route-migration, legacy-origin, and compatibility
  files even when they are adjacent to useful Solid code.
- Use exact pathspecs for commits; never blanket-stage unrelated work.

## Verification

Run the smallest focused tests first, then the standalone type, lint, unit,
Storybook, Worker build, SSR/hydration, api-next provenance, session/cookie,
CSRF, and dependency-audit gates appropriate to the tranche. A copied parity
row is not accepted until its evidence level is recorded; the historical
119/177 figure includes at least one runtime-pending row.

The app Storybook (`bun run storybook`, default port 6006;
`bun run build-storybook`) owns only app stories under `src/`; set
`STORYBOOK_PORT` to run it on another port. The design-system catalog remains
at `packages/solid-ui`, defaults to port 6007, and accepts the same override.

## Type checking

Routine local checks use the exact pinned tsrs release. Run `bun run typecheck`
for the app or `bun run typecheck:all` for the app, E2E and Solid UI projects.
`verify` and `check:e2e` also use tsrs. CI additionally runs
`bun run typecheck:typescript` against the retained official TypeScript version.
Keep the `typescript` dependency for compiler API consumers and compatibility
checks. Changes to the tsrs pin require an explicit reviewed dependency update.

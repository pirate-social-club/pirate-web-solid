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

### Home route session upgrade

The `/` route is public-first: it renders `PublicFeed` immediately for
anonymous discovery, then resolves the host-only api-next session cookie in the
browser. A successful resolution swaps the route to `HomeFeed`; while the
resolution is pending, after an anonymous result, or after a resolution error,
the public surface remains visible. `PublicFeed` must stay credential-free and
`HomeFeed` must use the existing `GetHomeFeed` contract with same-origin
credentials. This is an intentional route-level upgrade, not a cursor,
projection, or API compatibility change.

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

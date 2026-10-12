# Pirate Web Solid

Standalone SolidJS shell for a direct Cloudflare Worker. This repository owns
its source, internal `packages/solid-ui` workspace, Worker entrypoint, and
dependency graph. Its Worker owns the same-origin `/api` proxy to api-next and
the browser uses host-only session cookies plus double-submit CSRF for writes.

## Runtime boundary

- `src/worker.ts` is the only Worker entrypoint.
- Cloudflare bindings and environment-specific api-next origins are declared in
  `wrangler.jsonc`; secrets are provisioned bindings, never source values.
- The disabled-by-default external-community ingress and its credential
  references are documented in `docs/hns-community-app-ingress-secrets.md`.
- `worker-configuration.d.ts` is generated from `wrangler.jsonc` by Wrangler;
  rerun `bun run generate-worker-types` after configuration changes.
- SSR and hydration are authored in `src/entry-server.tsx`,
  `src/entry-client.tsx`, and `src/Document.tsx`.
- The UI catalog is owned by `packages/solid-ui` and consumed as the internal
  `@pirate/web-solid-ui` workspace package.

The root route is public-first and upgrades to the authenticated home feed only
after resolving the api-next session. Signed-out surfaces remain credential-free.

## Verification

Offline checks:

```bash
bun install --frozen-lockfile
bun run verify
bun run build
bunx wrangler deploy --dry-run --config dist/ssr/wrangler.json
bun run post-engagement-check
```

`verify` regenerates Worker types, typechecks the app and solid-ui package,
runs the scoped lint and unit gates, checks the Solid runtime identity, and
runs the solid-ui tests, followed by the advisory Solid Doctor scan. Solid
Doctor is pinned as a dev dependency and uses the committed baseline to keep
known findings quiet while surfacing new ones. Storybook fixtures are ignored
because they intentionally exercise read-once component props. The doctor scan
returns a non-zero status only for error-severity findings.

For pull requests, run the doctor in diff mode; run a full scan on the main
branch so transitive client-reachability changes are not hidden:

```bash
bun run check:solid-doctor
bunx solid-doctor . --diff base...head
```

When a finding is intentionally accepted, review it and update the baseline
explicitly:

```bash
bunx solid-doctor . --write-baseline .solid-doctor-baseline.json
```

The dry run is local validation only. `post-engagement-check` is a proxy
transport check: it proves the six engagement writes traverse the actual Solid
Worker `/api` boundary with exact paths, bodies, cookies, Origin, and CSRF
headers; component behavior is covered by app and Storybook tests.

The Solid UI suite consumes an integrity-pinned tarball built from the official
Kobalte `solid2` branch at commit
`a892187065cf7e0d07e91db02310bd28a5619236`; the source, build, and SHA-512
evidence are recorded in `vendor/kobalte-core-provenance.json`. The runtime
check resolves this package from `packages/solid-ui` and verifies the vendored
build. The jsdom test harness pins `30.0.0` with a narrow null-resolution patch;
its deterministic geometry fixture is exercised by the Scrubber tests. No UI
tests are skipped.

For local browser checks, install a project-local Chromium, build, and start a
foreground preview:

```bash
PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers bunx playwright install chromium
bun run build
bun run preview -- --port 4173
SOLID_BASE_URL=http://localhost:4173 bun run verify:live
```

`verify:live` runs the SSR stream probe and the hydration fixture check. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` when using an existing local Chromium binary.

## Main publication

The assigned cloud staging journey uses GitHub feature branches and protected
pull requests, as authorized in
[the cloud handoff](https://github.com/pirate-social-club/api-next/issues/595#issuecomment-6126612932).
This applies to `cloud/naming-karaoke-20261012` and its assigned guest UI
successor. Publish the named feature branch, open a PR, complete independent
source/dependency/browser review and require current `verify`, `storybook-audit`
and `Solid Doctor (PR)` checks on protected `main` before acceptance. Use a
normal merge so the accepted Naming and Karaoke histories remain reachable.
Do not squash, rebase, force-push or push `main` directly.

These cloud lanes need no Radicle signing identity or workstation round-trip.
Preserve the existing Radicle histories and read-only proof, private local
holds and unrelated release pins. The legacy `scripts/configure-radicle-primary`
and `scripts/publish-main` helpers belong to the historical Radicle route
outside this assigned scope; do not use them to bypass the protected PR route.
Keep the existing GitHub fetch URL and change a local `no-push` guard only if
needed for the authorized feature branch.

GitHub Actions verifies and packages source with Worker dry runs. Production
deployment remains separately gated by the manual guarded workflows; source
acceptance permits no deployment, SQL application, secret mutation, feature
activation or funded operations. Production remains paused.

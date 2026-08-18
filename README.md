# Pirate Web Solid

Standalone SolidJS shell for a direct Cloudflare Worker. This repository owns
its source, internal `packages/solid-ui` workspace, Worker entrypoint, and
dependency graph. It has no product API, authentication, external origin, or
route-dispatch fallback; those belong to a later same-origin `/api` proxy lane.

## Runtime boundary

- `src/worker.ts` is the only Worker entrypoint.
- The only Cloudflare binding is `ASSETS`.
- `worker-configuration.d.ts` is generated from `wrangler.jsonc` by Wrangler;
  rerun `bun run generate-worker-types` after configuration changes.
- SSR and hydration are authored in `src/entry-server.tsx`,
  `src/entry-client.tsx`, and `src/Document.tsx`.
- The UI catalog is owned by `packages/solid-ui` and consumed as the internal
  `@pirate/web-solid-ui` workspace package.

The shell intentionally renders only a root route with internal Button, Dialog,
and TextField hydration fixtures. No API or auth behavior is implied by the
shell.

## Verification

Offline checks:

```bash
bun install --frozen-lockfile
bun run verify
bun run build
bunx wrangler deploy --dry-run --config dist/ssr/wrangler.json
```

`verify` regenerates Worker types, typechecks the app and solid-ui package,
runs the scoped lint and unit gates, checks the Solid runtime identity, and
runs the solid-ui tests. The dry run is local validation only and must report
`env.ASSETS` as the sole binding.

The current Solid UI suite has an upstream Kobalte `2.0.0-alpha.0` / Solid 2
RC incompatibility in development-mode overlay focus restoration and reactive
state writes; the failing tests are retained in the gate rather than skipped.

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

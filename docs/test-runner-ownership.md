# Test runner ownership

Every `*.test.ts` and `*.test.tsx` file under `src` has exactly one executing
runner. This note maps the runners to their commands, records the unowned
inventory honestly, and describes the discovery check that keeps the map
current.

## Runners and commands

| Runner | Configuration | Command | Scope |
| --- | --- | --- | --- |
| App components | `vitest.app.config.ts` | `bun run test:app` | jsdom with DOM-compiled Solid. The include is an explicit file list so a new suite opts in deliberately. |
| API and ingress | `vitest.api.config.ts` | `bun run test:api` | Node environment. Glob includes `src/api/**/*.test.ts`, `src/hns-ingress/**/*.test.ts` and `src/worker.test.ts`. |
| Server markup | `vitest.ssr.config.ts` | `bun run test:ssr` | Node environment with SSR-compiled Solid, for tests that read the response HTML itself. |
| E2E helper regressions | `scripts/*.test.mjs` | `bun run test:e2e:helpers` | `node --test` over the shared sign-in, preflight and diagnostics helpers. No browser. |
| Playwright E2E | `e2e/playwright.config.ts` and `e2e/community-creation.config.ts` | `bun run check:e2e` (types and discovery), `bun run test:e2e:community-creation` (the required creation journey) | Browser flows against staging or a prepared loopback origin. |
| Shared UI package | `packages/solid-ui` | `bun run --cwd packages/solid-ui test` | The design-system package owns its own suite. |

`bun run verify` chains the app, API, SSR, helper and E2E discovery gates plus
the static checks, and hosted CI runs `verify` on main pushes and pull
requests. The app-wide TypeScript check covers `src`, `scripts` and the Vite
configuration, so a new script or suite is type-checked by that gate.

## Unowned inventory

Sixty-three `src` suites imported `bun:test` when the inventory was taken on
2026-09-13. That count is an inventory, not a coverage claim: some may be
dead, some may be deliberately Bun-only, and each still needs an owner. The
creation model suites were resolved the same day:
`src/features/community/create-community/create-community-model.test.ts` now
runs in the app gate, and the progress model test was removed with the
intent-view consolidation once its subject became fixture-only. The remaining
fifty-nine are recorded in `scripts/test-discovery-allowlist.json`. The list
is a ratchet: it may only shrink. Remove an entry when its suite gains a
runner, is converted to Vitest, or is deleted. Recording a suite there does
not make it executed or owned.

## Discovery check

`bun run check:test-discovery` runs `scripts/check-test-discovery.ts` and is
wired into `verify` after `check:e2e`, so hosted CI enforces it. It reads the
include patterns from the three Vitest configurations, enumerates every
`*.test.ts(x)` under `src`, and fails when:

- a file is matched by no runner and is not in the allowlist;
- a file imports `bun:test` while a Vitest runner also claims it;
- an allowlist entry no longer exists, is now matched by a runner, or no
  longer imports `bun:test`.

The check prints the per-runner count on success. Its failure messages name
the exact file and the fix: add an include, convert the suite, or record it in
the allowlist.

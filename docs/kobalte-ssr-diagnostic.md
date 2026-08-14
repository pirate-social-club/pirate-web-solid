# Kobalte SSR and design-system boundary diagnostic

Status: **GREEN for the real Button/M1 integration gate; Batch 2 is gated on
portalled-overlay and compound-form app fixtures.**

Date: 2026-08-14

## Finding

The first failure was a duplicate runtime: the linked design-system installed
its own `solid-js` and `@solidjs/web`, so the app and design-system resolved
different Solid runtimes. After that boundary was normalized, a second seam
appeared in Kobalte 2 alpha: its default Button path sends children through
`Polymorphic`/`Dynamic`, and reactive children passed through that path render
but do not hydrate under Solid 2 RC.

The diagnostic was reproduced in a disposable design-system worktree without
changing the dirty canonical checkout:

- the canonical linked package resolves `solid-js` and `@solidjs/web` from its
  own `node_modules`, distinct from the app copies;
- the app's transitive runtime check now fails on that second copy before the
  hydration gate can be called green;
- a bare Kobalte Button with static children hydrates after runtime
  normalization, while a reactive child reproduces the failure;
- the failure persists through the design-system wrapper even without its
  original prop spread, so `omit(...)` is not the terminal cause;
- a focused Kobalte patch that renders the default `button` element directly
  (and keeps the polymorphic path for an explicit custom `as`) makes the real
  design-system Button hydrate with reactive children, loading, and icon
  branches.

## Required fix sequence

1. In the design-system repository, keep exact `solid-js` and `@solidjs/web`
   `2.0.0-rc.0` entries in `peerDependencies` only. Link the package through
   the app's Bun workspace so a clean install cannot create a second runtime.
2. Apply the pinned Kobalte patch in the design-system package. The exact
   `@kobalte/core@2.0.0-alpha.0` pin and patch path must remain in both package
   manifests/lockfiles. The default
   Button must render the native element directly; custom polymorphic `as`
   remains on the original path. The design-system Button must pass children
   directly; it may use `omit(...)` for ordinary attribute forwarding once the
   Kobalte default path is patched.
3. Run
   `rtk bun run check-solid-runtime`. It must report one runtime or fail.
   It also verifies the exact Kobalte version and fails loudly if the patched
   Button output is absent after installation.
4. Keep the real
   design-system Button. Run the build, 16 seam probes, streaming check, and
   Playwright hydration click-through under enforced CSP.
5. Before Batch 2 closes, add one portalled overlay and one compound form
   control to the app-level hydration gate. See
   `app-component-hydration-gate.md`.

## Patch ownership and tripwire

Current state: **one patch file, two behavioral areas** — Solid 2 signal
compatibility in Kobalte internals and the default Button hydration path. The
patch is reproducible through Bun's `patchedDependencies` entry and is exact
pinned to `@kobalte/core@2.0.0-alpha.0`; the app runtime check verifies that the
patched output is present after install. The proposed upstream report is
prepared in `kobalte-solid2-upstream-issue.md` and has not been filed
externally.

Count distinct behavioral Kobalte patches, not changed lines. At three, reopen
the Ark UI comparison before expanding the catalog further.

The app-side guard, diagnostic markup, Kobalte patch, and real Button gate are
committed separately from the unrelated engagement work in the design-system
checkout. The app check must be run with the linked package's local Solid
copies absent; peer dependencies resolve from the app runtime.

## Non-goals

This diagnostic does not deploy anything, change the relay/API lane, or prove
the rest of the component catalog. M2 remains blocked by the separately
unattributed relay 500 and should use the instrumented staging path.

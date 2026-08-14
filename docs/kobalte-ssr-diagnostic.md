# Kobalte SSR and design-system boundary diagnostic

Status: **GREEN for the real Button/M1 integration gate; Batch 1 still requires
the design-system package's focused SSR/component checks.**

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

1. In the design-system repository, move exact `solid-js` and `@solidjs/web`
   `2.0.0-rc.0` entries from `dependencies` to `peerDependencies`, remove its
   local installed copies, and reinstall.
2. Apply the pinned Kobalte patch in the design-system package. The default
   Button must render the native element directly; custom polymorphic `as`
   remains on the original path. Keep the design-system Button wrapper free of
   component prop spreads and pass children directly.
3. Link that normalized package into this app and run
   `rtk bun run check-solid-runtime`. It must report one runtime or fail.
4. Replace the native placeholder in the app hydration test with the real
   design-system Button. Run the build, 16 seam probes, streaming check, and
   Playwright hydration click-through under enforced CSP.
5. Only after that passes may Batch 1 component work begin.

The app-side guard, diagnostic markup, Kobalte patch, and real Button gate are
committed separately from the unrelated engagement work in the design-system
checkout. The app check must be run with the linked package's local Solid
copies absent; peer dependencies resolve from the app runtime.

## Non-goals

This diagnostic does not deploy anything, change the relay/API lane, or prove
the rest of the component catalog. M2 remains blocked by the separately
unattributed relay 500 and should use the instrumented staging path.

# Kobalte SSR and design-system boundary diagnostic

Status: **RED for Batch 1 until the design-system package is normalized and
the real Button passes the app hydration gate.**

Date: 2026-08-14

## Finding

The failure is not an inherent Kobalte SSR limitation. The linked design-system
currently installs its own `solid-js` and `@solidjs/web`, so the app and the
design-system resolve different Solid runtimes. The original full design-system
Button then rendered on the server but did not attach on the client. The shell
hydration check used a native button and therefore did not cover this boundary.

The diagnostic was reproduced in a disposable design-system worktree without
changing the dirty canonical checkout:

- the canonical linked package resolves `solid-js` and `@solidjs/web` from its
  own `node_modules`, distinct from the app copies;
- the app's transitive runtime check now fails on that second copy before the
  hydration gate can be called green;
- a bare Kobalte Button hydrates successfully after the runtime boundary is
  normalized;
- the full design-system Button fails with its existing `omit(...)` prop path;
- the same full wrapper hydrates successfully when that path is replaced with
  Solid's `splitProps(...)` while preserving the existing loading, icon, and
  child rendering behavior.

Candidate design-system commit in the disposable worktree:
`e76a8bb Normalize Solid peers and preserve button hydration`.

## Required fix sequence

1. In the design-system repository, move exact `solid-js` and `@solidjs/web`
   `2.0.0-rc.0` entries from `dependencies` to `peerDependencies`, remove its
   local installed copies, and reinstall.
2. Replace the Button wrapper's `omit(...)` path with the tested
   `splitProps(...)` implementation. Preserve the public props and rendered
   behavior; do not copy components into this app.
3. Link that normalized package into this app and run
   `rtk bun run check-solid-runtime`. It must report one runtime or fail.
4. Replace the native placeholder in the app hydration test with the real
   design-system Button. Run the build, 16 seam probes, streaming check, and
   Playwright hydration click-through under enforced CSP.
5. Only after that passes may Batch 1 component work begin.

The app-side guard, diagnostic markup, and design-system-root override are
committed separately from the design-system fix. The canonical
`solid-storybook-poc` checkout remains untouched by this investigation.

## Non-goals

This diagnostic does not deploy anything, change the relay/API lane, or prove
the rest of the component catalog. M2 remains blocked by the separately
unattributed relay 500 and should use the instrumented staging path.

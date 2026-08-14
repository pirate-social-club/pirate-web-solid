# Upstream issue: Kobalte default Button and Solid 2 hydration

Status: **filed externally**

Issue URL: `https://github.com/kobaltedev/kobalte/issues/717`

Title: `Default Button loses hydration for reactive children under Solid 2 RC`

## Environment

- `solid-js`: `2.0.0-rc.0`
- `@solidjs/web`: `2.0.0-rc.0`
- `@kobalte/core`: `2.0.0-alpha.0`
- `@solidjs/vite-plugin`: `3.0.0-next.27` start mode
- Vite `8.x`

## Minimal reproduction

SSR and hydrate a Kobalte `Button` with a reactive child and an interaction
that changes that child. A static child renders and hydrates in the same
fixture. With the default Button path, the reactive child is present in the
server HTML and the client bundle loads, but the server-rendered Button does
not attach its handler or update its child after hydration.

The implicated path is the default `Polymorphic`/`Dynamic` rendering used by
Kobalte Button. A direct native `button` path for the default case restores
hydration while preserving the existing polymorphic path for an explicit
custom `as` element.

## Expected and actual

Expected: a default Kobalte Button with a reactive child hydrates like a
native button, including event handlers and child updates.

Actual: the SSR tree renders, but the reactive child/event binding remains
inert after hydration under Solid 2 RC.

## Current workaround

The workaround excludes `children` and `as` from forwarded props, renders the
default case as a native `button` with explicit children, and retains the
original `Polymorphic` path only when `as` is explicitly non-`button`.

Please confirm whether Solid 2 support is tracked, whether this rendering path
is expected to work in the alpha line, and whether an upstream patch or
supported release is planned. We can provide the smallest reproduction and
remove the workaround once a released fix is available.

## Filing record

Repository confirmed from npm metadata: `https://github.com/kobaltedev/kobalte`

The issue body contains only the environment, minimal reproduction, expected
and actual behavior, workaround, and upstream questions above.

# App component hydration gate

Status: **required before Batch 2 closes**

Date: 2026-08-14

## Purpose

The shell gate now proves that one real design-system Button renders on the
Worker, survives the enforced CSP, and becomes interactive after hydration.
Design-system SSR smoke tests are supplemental; they do not exercise the
linked package inside the app's Worker adapter, middleware, CSP, or browser.

The app gate must grow with the catalog so a component is not accepted merely
because it renders in Storybook or in a node-only SSR check.

## Required fixtures

Before Batch 2 is closed, the app regression suite must render one fixture from
each of these families on an app route:

| Family | Fixture | Required proof |
| --- | --- | --- |
| Action control | `Button` (existing) | SSR markup, click state change, no hydration warning |
| Portalled overlay | `Dialog` preferred; `Tooltip` is acceptable if Dialog is not yet ready | open and close, portal content appears, focus/keyboard behavior, nonce remains valid |
| Compound form control | `TextField` preferred; `Input` is the minimum | SSR value/label wiring, focus, controlled value update, validation or description wiring |

The fixture must use the real exported component from the linked design-system
package. Native substitutes and copied component files do not count.

## Gate checks

Run the fixtures against a foreground `web-solid` Worker preview, with the
same CSP and HNS middleware used by the app:

1. Assert that the server-rendered marker exists before interaction.
2. Assert every generated and late-stream script carries the request nonce.
3. Hydrate in the project-local Playwright browser and fail on console errors,
   hydration warnings, or uncaught page errors.
4. Exercise the family-specific interaction listed above and assert the DOM
   state changed. For overlays, assert open/close and focus; for form controls,
   assert input and label/description behavior.
5. Run the existing 16 seam probes and streaming check in the same focused
   verification pass.

The implementation may be one script with fixture selectors or separate
fixture scripts, but the checks must be permanently committed under
`web-solid/scripts/` and run against this repository, not against
`solid2-seam-poc` or Storybook.

## Acceptance policy

Every new interactive design-system component must name its app hydration
fixture and pass the relevant family check before its batch is marked complete.
Component-level SSR tests remain useful for fast feedback, but an app-gate
failure blocks acceptance even when those tests pass.

Track Kobalte work in `kobalte-ssr-diagnostic.md`. The current workaround is
one patch file containing two behavioral areas (Solid 2 signal compatibility
and the default Button hydration path). If the catalog reaches three distinct
Kobalte behavioral patches, reopen the Ark UI comparison before adding more
components on top of the patched provider.

## Batch 2 close condition

Batch 2 cannot close until Button, one portalled overlay, and one compound
form control all pass this app-level gate under enforced CSP, with the exact
dependency pins and single-runtime check passing in a clean install.

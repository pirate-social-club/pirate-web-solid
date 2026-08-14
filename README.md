# Pirate Web Solid

Solid 2 RC start-mode application shell for Cloudflare Workers. This is a
standalone repository; it is not the React Web repository and it does not
contain product feature routes yet.

## Locked foundation

The shell carries the verified arrangement from `solid2-seam-poc`:

- authored `Document` with per-request CSP nonce;
- `#app-root` plus client `hydrate(..., { renderId: "2" })`;
- Worker adapter forwarding non-assets to `handleRequest`;
- ASSETS and PUBLIC service-binding topology;
- HNS apex redirect and app-host classification;
- streaming SSR through the Worker adapter; and
- authored server entry passing the built asset manifest to streaming SSR; and
- filesystem-routing manifest consumed by Solid Router 2 for the application,
  bare-surface, community, settings, seam, API, and not-found routes.

The `solid2-seam-poc` repository remains the evidence source; this repository
owns the permanent probes and hydration regression gate.

## Design-system linkage

The app consumes the unpublished `../solid-storybook-poc` repository through a
Bun workspace dependency named `pirate-solid-design-system`. The workspace
entry is deliberate: a clean `rtk bun install` resolves the design system's
Solid peer dependencies from this app instead of creating a second runtime in
the linked package. The design-system package is exact-pinned at `0.2.0` in
its own `package.json` and in the workspace lockfile. Components are imported
only through `src/design-system.ts`; copying component files into this
repository is forbidden. The app imports the design system's Tailwind v4 token
layer and uses the same Tailwind Vite pipeline.

Vite aliases and `resolve.dedupe` force `solid-js` and `@solidjs/web` to the
app's single runtime instance. The design-system package exposes those two
exact versions as peer dependencies, and its Kobalte Button uses the pinned
Solid 2 hydration patch. Run `rtk bun run check-solid-runtime` after every
clean install and before declaring hydration green; the check intentionally
fails if the linked package has local Solid copies, the Kobalte version drifts,
or the patch no longer appears in the built package.

## Routing and data

The app uses `@solidjs/router@2.0.0-next.16` with
`filesystem-routing@0.2.1`. The route tree is created once in `App.tsx` from
the `virtual:file-routes` manifest; layouts stay outside `Document.tsx`, so
the `#app-root` and `renderId: "2"` hydration boundary cannot move. The same
tree serves canonical and sovereign host surfaces. Solid Router is selected
because it consumes the already-proven filesystem route manifest. TanStack
Router remains a future option only if typed search parameters become a real
requirement.

Middleware exposes a `HostContext` to every route:
`surface` is `canonical`, `sovereign-app`, or `sovereign-apex`;
`communitySlug` is the trusted forwarded slug or derived HNS label;
`importedRoot` identifies sovereign apex requests; and
`forwardingMetadataPresent` records whether the trusted forwarder supplied
required metadata. A sovereign apex request without forwarding metadata
returns the deliberate `404` outcome
`sovereign-forwarding-metadata-required`; it must not fall through to an
accidental router not-found.

`@tanstack/solid-query@6.0.0-rc.0` is provided per app render through a
`QueryClientProvider`. Route-level preload/query work is the default
convention; page entry components should not start uncoordinated fetches.
Query keys and cache policy follow the existing TanStack mental model. API
list routes use keyset-cursor pagination, not offset pagination; cursor shape
is a known API integration trap and must be captured in the query contract
before a feature route is added. Metadata uses the Solid 2-compatible
`@solidjs/meta@1.0.0-next.2` API (`Head`, `Title`, `Meta`, and `Link`).

## Verification

Install the project-local browser, then run one foreground preview at a time:

```bash
rtk env PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers bunx playwright install chromium
rtk bun run build
rtk bun run check-solid-runtime
rtk bun run preview -- --port 4173
rtk env SEAM_BASE_URL=http://127.0.0.1:4173 PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers WEB_SOLID_BASE_URL=http://127.0.0.1:4173 bun run verify
```

`build` runs the runtime/patch guard through `prebuild`. `verify` is the
single focused shell gate: it checks the runtime and patch, the seam, routing,
API, host-context, layout, and not-found probes, streaming, and browser
hydration of the real design-system Button plus a dynamic client navigation.
Run it while the foreground preview is active, then stop that preview. No
shared Cloudflare resource may be deployed by the bootstrap.

## Scope

M1 contains only the shell, placeholder routes, seam and API routes, middleware,
Worker adapter, probes, design-system boundary, and a stub Privy adapter at
`src/lib/auth/privy.ts`. Login UI, relay calls, feature routes, and the catalog
port belong to later milestones.

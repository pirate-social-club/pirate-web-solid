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
- filesystem-routing manifest with a placeholder `/` route.

The `solid2-seam-poc` repository remains the evidence source; this repository
owns the permanent probes and hydration regression gate.

## Design-system linkage

The app consumes the unpublished `../solid-storybook-poc` repository through a
fixed `file:` dependency named `pirate-solid-design-system`. Components are
imported only through `src/design-system.ts`; copying component files into this
repository is forbidden. The app imports the design system's Tailwind v4 token
layer and uses the same Tailwind Vite pipeline.

Vite aliases and `resolve.dedupe` force `solid-js` and `@solidjs/web` to the
app's single runtime instance. Run `rtk bun run check-solid-runtime` before
declaring hydration green. The design-system package must eventually expose
those two packages as peer dependencies; this app does not modify that
repository.

## Verification

Install the project-local browser, then run one foreground preview at a time:

```bash
rtk env PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers bunx playwright install chromium
rtk bun run build
rtk bun run check-solid-runtime
rtk bun run preview -- --port 4173
rtk env SEAM_BASE_URL=http://127.0.0.1:4173 bun run probe
rtk env SEAM_BASE_URL=http://127.0.0.1:4173 bun run stream-check
rtk env PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers WEB_SOLID_BASE_URL=http://127.0.0.1:4173 bun run hydration-check
```

Stop the foreground preview after verification. No shared Cloudflare resource
may be deployed by the bootstrap.

## Scope

M1 contains only the shell, placeholder route, seam routes, middleware, Worker
adapter, probes, design-system boundary, and a stub Privy adapter at
`src/lib/auth/privy.ts`. Login UI, relay calls, feature routes, and the catalog
port belong to later milestones.

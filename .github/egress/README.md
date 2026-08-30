# CI egress observations

These job-specific allowlists were observed on 2026-08-30 with the signed
Iron Proxy 0.41.0 Linux release. The release checksum manifest signature,
signing-key fingerprint `7969C7E131F29652C601752C64D88022DBC645D1`, and
archive checksum were verified before execution. The proxy ran unprivileged on
high ports and did not alter host DNS, firewall, sudo, or Docker configuration.

The authoritative observation started with no `node_modules` directory and an
empty isolated Bun cache. It covered `bun install --frozen-lockfile`, the
dependency policy audit, `bun audit`, the full repository verification suite,
the staging Worker build and Wrangler dry-run, both Worker proxy-transport
checks, the Storybook build, and the full Storybook axe and interaction sweep.
Across 660 proxied outbound requests, the only destinations were
`registry.npmjs.org`, `sparrow.cloudflare.com`, and `workers.cloudflare.com`.
Every request completed with an allow action and no proxy error. All 660 were
reported as warn-mode policy misses because the observation configuration
deliberately withheld these domains.

After the check-job proxy activation, only `sparrow.cloudflare.com` and
`workers.cloudflare.com` were contacted. The dependency-audit and Solid Doctor
jobs need only the registry for their frozen installs and audit work. The
pinned Iron action supplies its built-in GitHub rules separately.

The clean frozen bootstrap installed 581 packages, `bun pm untrusted` reported
zero packages, the policy audit scanned zero advisory instances, and `bun
audit` found no vulnerabilities across 672 packages. The full verification
suite passed. The Worker build, Wrangler dry-run, proxy-transport checks, and
Storybook build also passed.

The complete 661-story browser sweep ran and failed; it was not skipped. Axe
reported 632 passes, 25 violation failures, and 4 indeterminate results.
Interactions reported 639 passes, 18 failures, and 4 indeterminate results.
The generated ledger and summary remain under `.tmp/storybook-a11y/` as local
evidence. Those existing product and story failures are outside this
supply-chain change.

The local Playwright browser was pre-provisioned with `bun run playwright
install chromium`. The local `--with-deps` path was deliberately not run
because it requires sudo and would mutate host packages. CI retains `bun run
playwright install --with-deps chromium` before Iron activation so apt-managed
system dependencies are provisioned without bypassing the proxy for any later
browser check.

A preliminary observation attempt used a direct public DNS resolver that this
host blocks and therefore produced registry 502 responses. The resolver was
changed to the host system resolver, the log and isolated install state were
reset, and the authoritative run above completed with zero proxy errors.

Keep separate files even while some domains coincide so later job-specific
traffic does not widen every job. Re-observe after a dependency source,
installer, action, or workflow change and before switching Iron from warn mode
to enforcement.

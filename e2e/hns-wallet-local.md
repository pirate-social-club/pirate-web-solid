# HNS wallet publication recovery

`bun run test:e2e:hns-wallet-local` runs eight isolated Chromium scenarios
through the production settings panel, controller, namespace adapter and
generated API client. The suite starts its own loopback Vite fixture on port
4197, refuses to reuse an existing server, and intercepts API responses. A
stubbed `bob3` provider records calls without connecting to a real wallet.
External requests are refused. No credentials or chain access are required.
The normal CI workflow runs this command after its existing verification gate.

Run from this repository after `bun install --frozen-lockfile`. Playwright's
pinned Chromium must already be installed. On the shared workstation, retain
the resource cap:

```sh
systemd-run --user --wait --pipe --collect \
  --setenv=PATH="$PATH" --working-directory="$PWD" \
  -p CPUWeight=20 -p CPUQuota=100% -p Nice=19 \
  -p MemoryHigh=3G -p MemoryMax=4G -p RuntimeMaxSec=360 \
  "$(command -v node)" node_modules/playwright/cli.js \
  test -c e2e/hns-wallet-local.config.ts --max-failures=1
```

The configuration uses one worker and one headless Chromium. Each test gets a
fresh browser context. The two-tab case uses two pages in one context with real
shared localStorage and Web Locks. Reloads preserve that context's storage.
The runner closes its browser and fixture server on completion.

Coverage includes a lost acknowledgement before and after server acceptance,
reload during an unresolved wallet send, ambiguous wallet completion, native
cross-tab exclusion while connection is pending, a dismissed connection followed
by a successful retry, and manual acknowledgement without storage or locks.
The tests assert the exact complete-resource wallet call and its count, rather
than treating a displayed success message as proof against replay. Recovery
screenshots and failure traces are under `.tmp/hns-wallet-browser/`.

This is browser recovery evidence. Real Bob interaction, server-owned
cross-device receipts, chain confirmation, ownership renewal, gateway serving
and production recovery still require their respective acceptance journeys.
An error after `sendUpdate` starts remains ambiguous, including a transaction
prompt cancellation that Bob cannot distinguish from a lost response. Only
connection failures are known to precede the send and remain freely retryable.

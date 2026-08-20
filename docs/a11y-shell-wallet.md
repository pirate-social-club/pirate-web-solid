# Shell and wallet accessibility tranche

This tranche owns the shared application sidebar and wallet Storybook stories.
It does not change bookings, community, karaoke, or studying files.

## Evidence boundary

The deterministic Storybook sweep was unable to produce a fresh reporter result
on this drive: concurrent browser processes entered uninterruptible I/O and the
selected run classified all 20 selected stories as
`story_finished_timeout`. The earlier committed sweep ledger at
`/tmp/standalone-axe-sweep.jsonl` is retained as historical evidence, not as
the post-change gate. A fresh runtime sweep remains pending.

The selected IDs for the runtime gate are:

- AppSidebar: `compositions-app-appsidebar--desktop-shell`,
  `compositions-app-appsidebar--desktop-shell-with-action`,
  `compositions-app-appsidebar--collapsed-icon-rail`,
  `compositions-app-appsidebar--communities-overflowing`, and
  `compositions-app-appsidebar--mobile-shell`.
- WalletHub: `compositions-wallet-wallethub--default`, `--deferred`,
  `--empty-assets`, `--mobile`, `--bounties`, `--bounties-mobile`,
  `--with-send-receive-sheets`, and `--with-sheets-mobile`.
- WalletSendSheet: `compositions-wallet-walletsendsheet--asset-network`,
  `--mobile`, `--invalid-address`, `--pending`, `--success`, `--error`, and
  `--full-flow`.

The validated baseline owned rules were:

- `color-contrast` on AppSidebar `--communities-overflowing`, `--desktop-shell`,
  `--desktop-shell-with-action`, and `--mobile-shell` (the collapsed icon rail
  passed).
- `heading-order` on the WalletHub full-sheet story.
- `scrollable-region-focusable` on WalletSendSheet pending.

The full-flow interaction also queried `canvasElement` even though Kobalte
portals the sheet dialog into `document.body`.

## Changes

- AppSidebar navigation, labels, badges, borders, and active/hover states now
  use the sidebar token family rather than the page muted tokens. This keeps
  contrast coupled to the sidebar surface in both themes.
- WalletHub keeps a real `h1` route heading and `h2` section headings instead
  of compound-card `h3` headings, preventing a heading-order violation when
  the receive/send sheets are mounted.
- WalletSendSheet keeps the bounded, focusable asset list and explicit terminal
  live regions; its full-flow play now queries the portaled dialog in
  `document.body`.

Runtime axe/interaction status after these changes: pending drive recovery.

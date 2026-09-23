# Shared navigation

`ApplicationChrome` owns the desktop sidebar, the mobile header and drawer,
and the four mobile tabs: Home, Your songs, Wallet and Profile. It composes the
existing `AppSidebar`, `MobilePersonaFooter`, `PersonaSwitcherSheet` and
responsive `Modal`. Route loading stays inside the chrome. The sidebar shows
the selected profile instead of account diagnostics. Notifications are not
advertised.

The profile control opens a bottom sheet below the desktop breakpoint and a
centered dialog on desktop. Selection is an account-private, in-memory
navigation preference retained across route changes. It does not choose the
persona for community writes or override their authority checks. The picker
also links to the selected public profile and Settings. Sign-out clears the
shared session and persona state. Settings currently contains account actions:
switch profile, view the selected public profile, open Wallet, and sign out. It
does not expose editable preferences yet. Navigation from the picker waits for
its modal layer to close before mounting the destination route.

The sidebar and mobile drawer reach Home, Your songs, Wallet, Your communities
and Settings. A labelled plus button creates a community within the Communities
section. Search, Live and legal links are omitted from navigation. The private
Wallet lists active persona wallet assignments from api-next. The selected
persona drives the Wallet Hub token rows and receive sheet. Mainnet and testnet
views each show Ethereum, DATA Network and Base; ETH and native USDC are listed
on Ethereum and Base, with native $DATA on DATA Network. These are a fixed asset
catalog, not automatic discovery of every token at the address.

The browser reads balances directly from the pinned viem network RPC endpoints,
using only the selected address. It sends no application credentials, account or
persona identifiers, and validates chain identity before reading balances.
Each request has an eight-second timeout and no retries. Persona, account,
network changes and unmount cancel reads and fence late results. Refresh reloads
balances; unavailable results remain unavailable rather than zero. Receive uses
the selected mode's actual network labels and closes on identity/network changes.

Fiat prices, automatic token discovery, transaction history and sending remain
unconnected. No testnet token is assigned a dollar value. Reward-funding signing
has a separate task and is not enabled by a balance read.

Your songs currently shows a "Song history is coming soon" state. The
persona song-library and public trending reads are parked in the api-next
`api-persona-song-library` task and are absent from the vendored client. The
route does not show fixture songs or claim to have loaded a live collection.
The future library model is retained behind that API boundary: it deduplicates
activity history, orders recent sessions first, paginates older entries and
fences late responses on persona or account changes. Trending stays a separate
public read. The populated Storybook stories demonstrate that future state
with fixtures and do not represent production data.

Storybook shows the current route components under `Screens/Shell/MediaShell`,
`Parts/Identity/PersonaSwitcher`, `Screens/Wallet/Portfolio`,
`Screens/Settings/Account` and `Screens/Songs/YourSongs`. The Your songs
`NotYetAvailable` story is the production state. The account recovery path is
also exercised by `scripts/hydration-check.mjs` with `SOLID_API_DOWN=1`.

# Verification

The current reintegration gates and screenshots are recorded in
`../../tasks/records/solid-navigation-four-tab-reintegration.md` in the workspace
control plane. Earlier branch verification counts belong to the preserved
`solid-navigation-persona-wallet` task record; they are not evidence for this
reintegrated checkout.

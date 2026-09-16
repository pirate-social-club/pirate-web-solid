# Persona wallet reward funding integration

This is the headless browser capability for rewards-sponsor-money-ui. It does
not enable a route or funding button, create offers, admit assets, choose
qualification policies or perform a live transaction during tests. The parent
must complete its policy-binding and admitted-asset dependencies before
claiming a complete funding journey.

## Composition and approval

Call createBrowserRewardFunding from src/api/reward-funding.ts after browser
hydration with a server-authenticated account/persona selection and an existing
funding target (reward kind, leg ID and funding-effect ID). The currentActor
callback must read the current selection, not return a captured constant.
Dispose the returned flow on logout, persona changes and component cleanup.
No provider token or application bearer token is persisted.

Use authorization.sendCode/loginWithCode, beginOAuth/completeOAuth, or
loginWithWallet only after an explicit reauthentication action. This separate
Privy session does not exchange the application's cookie, create a wallet or
retain the sign-in session. OAuth completion must return to the same living
in-memory flow, for example through the owning UI's popup callback. A full page
navigation discards that authorization and requires starting it again. The
external wallet method signs a login challenge only; funding still selects the
server-assigned embedded wallet by address and HD index.

If the provider reports wallet_wrong_chain, offer an explicit Base Sepolia
switch action calling selectTestnet, then prepare again. Do not switch networks
on page load. controller.prepare reads authoritative funding instructions,
checks the account/persona assignment and estimates the transfer fee. Render
the returned review's persona, sender wallet, network, asset address/decimals,
recipient, amount and fee before enabling an explicit confirm(review.id) action.
The parent supplies trusted asset display metadata; do not infer a symbol for
an arbitrary token. The fee's executionFeeAtomic is the estimated maximum
execution charge at the reviewed gas limit and gas price. It excludes additional
network data fees; do not label it the total transaction fee. A higher estimated
execution charge requires a new review. Never call confirm automatically after
authentication or preparation.

The parent owns the read-only complete activity-policy disclosure, immutable
policy binding and Megapot additional score floor. Wallet review is not proof
that those parent terms have been accepted. The controller builds only an
ERC-20 transfer to the server's recipient; it does not accept calldata from the
UI and never substitutes the login wallet or creates a new funding effect.

## Recovery and presentation

State review means approval is still required. State submitted means a hash is
retained but observation may need retry. State uncertain means submission may
have happened; a null hash must never offer a second transfer. State server
contains the backend's planned/confirming/confirmed/reverted/reconciliation_required
status. A returned hash never means confirmed funding. State cancelled permits
a new explicit review only after the owned adapter proves that a local check
failed before it invoked the send RPC and the receipt was removed successfully.
The originating error (for example wallet_reauthentication_required) is still
returned so the UI can request reauthentication. A provider's code 4001 is not
proof: it retains the receipt and returns reconciliation with provider_rejected.
After reload that retained null-hash receipt remains uncertain. State closed must clear
private presentation and require a new flow for the current actor.

Use controller.recover after navigation and for explicit status retries. It
reads server state and repeats only the observation using the same stored
idempotency key and hash. It never signs, broadcasts or creates another effect.
An unknown hash remains unresolved until server/operator reconciliation can
identify it; this implementation does not claim automatic discovery of a lost
hash. Do not provide a browser journal-reset button to bypass that hold.

State reconciliation is a hard stop for funding, with a reason and the known
transactionHash. transaction_mismatch also exposes serverTransactionHash;
show both for support and never label the anomaly an ordinary network retry.
terms_changed retains the submitted hash and continues observation. Successful
server responses can carry reconciliationReason; render that notice alongside
the actual backend status rather than discarding it.

Corrupt JSON and unreadable storage produce recovery_corrupt or
recovery_unavailable states instead of an unhandled exception. Keep damaged
journal evidence intact. Offer status retry and a support handoff identifying
the account/persona, funding target, reason and any known hash, without provider
credentials. If support locates the transaction, an explicit
controller.reconcileTransaction(hash) action observes it through the existing
server endpoint. This requires a held receipt or a storage problem, rejects
replacement of an already known hash, and never signs or clears the guard.
Only the server response establishes funding status; a supplied hash is not
proof. If no hash or authoritative outcome can be established, the hold remains.
A safe no-transfer reset requires a server-owned reconciliation protocol that
these APIs do not expose; browser deletion is not a substitute.

If storing a returned hash fails, observation is still attempted immediately.
The controller retains the hash and observation key in memory for further
retries, and the original durable null-hash guard remains. If both storage and
server observation fail and the page then disappears, the hash can still be
lost; the reloaded flow must reconcile rather than send again.

Recovery identifiers are stored under an account/persona/effect-specific key.
Web Locks serialize confirmation across tabs on the same origin. A storage or
lock failure prevents signing. The uncertain marker is written before broadcast
and is retained after ambiguous failures. Clearing site data or using another
device removes this browser's evidence; this is not a distributed exactly-once
guarantee. Cross-device submission needs a server-owned reservation/nonce
protocol before such a guarantee can be made. The backend remains authoritative
for crediting a funding effect once.

Call recover on a new browser flow before offering funding. Do not use auto
retry around confirm. Observe errors retain the hash for retry; wallet refusal,
assignment mismatch, wrong network, insufficient token/gas, fee changes and
provider availability errors should be presented as distinct actionable states.

## Runtime contract coverage

The selected client remains immutable 0.66.0. The runtime-table gate retains
all 43 existing entries and adds the four consumed funding reads/observations,
for 47 operations and digest
d1055972a9a81682bf214f8ccd79e4034e3993fb6b5baa687bd10a34a43c26cf.
The parent adds creation, projection and later discovery operations when used;
its earlier 54-operation candidate is not the digest of this narrower list.

## Local verification and review — September 8

Frozen-lockfile installation left dependency and client pins unchanged. TypeScript
checking passed. bun run test:api passed 193 tests across 32 files; bun run
test:app passed 552 tests across 71 files. bun run lint passed with advisory
warnings, including explicit RPC/storage boundary parsers. bun run build passed
for client and SSR, including Solid runtime, client provenance and all 47 covered
runtime operations. A temporary altered asset-funding response schema was
rejected by the runtime-table gate; the selected client was not modified.
Workspace bin/script-check --changed passed with zero findings.

An isolated agent-browser session at a localhost-only fixture exercised actual
localStorage and Web Locks across two same-origin documents. Two concurrent
confirmations produced one simulated send. Reload after an observation failure
reused the saved transaction hash and reached server confirming with one send.
Reload after a lost hash remained uncertain and did not expose another review
or send. The browser session and temporary HTTP server were closed afterward.
The reproducible fixture source is test/fixtures/reward-funding-browser.ts;
bundle it with bun build --target browser and serve it from a local secure
context. It exercises adapters with simulated server/wallet responses, not a
Privy login, an actual transfer, or the complete sponsor UI.

Source review checked exact account/persona/sender binding, immutable instruction
comparison before submission, the persisted pre-broadcast marker, refusal versus
uncertain outcomes, observation idempotency and actor-change cleanup. The
installed Privy default chain list includes Base Sepolia. SDK account selection
uses both address and HD index and does not call wallet create/add. Tests prove
that the external wallet receives only SIWE requests and that transaction
submission uses the assigned embedded provider. Existing login cleanup tests
continue to pass. No Storybook rendering change or new dependency was introduced;
no additional live authentication, provider configuration or deployment gate was
run or claimed.

## Failure recovery repair — September 8

The repair separates transport errors from hash-integrity checks, including
server reads during recovery. It exposes a known hash while observation is
still pending. The owned wallet adapter identifies a local pre-send failure;
provider errors never grant permission to delete the double-send receipt.
A composed adapter/controller test expires authentication after durable receipt
creation, reauthenticates, and proves exactly one subsequent send RPC.

The focused recovery/wallet tests and all 211 API tests pass. All 552 application
tests pass. Type checking, lint (advisory warnings), and the client/SSR build
including unchanged client provenance and 47-operation runtime coverage pass.
No dependencies, public API operations or runtime digest changed.

The extended localhost browser fixture verifies concurrent documents still
send once, code 4001 retains the guard after reload, a locally proven abort
permits a new explicit review, mismatches expose both hashes, terms drift
continues observation, and hash-write failure still attempts observation.
A truncated journal produces a handled support state after reload; supplying
a recovered hash reaches server confirming without modifying that journal.
The isolated browser and fixture server were closed. These remain simulated
transfers; no live authentication, transaction, deployment or publication ran.

This repairs the preserved funding branch from 23c2ca4. It does not rebase or
integrate the branch into the independently advancing Solid main. Acceptance
against the then-current main and the composed sponsor ceremony remain separate.

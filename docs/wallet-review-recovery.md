# Wallet review recovery

This tranche recovers behavior from the final reviewed `web/solid` wallet
state without importing its router, session, React, legacy API, or modal
dependencies. The standalone app keeps its route-neutral callbacks and
Kobalte `Sheet` boundary.

| Accepted source | Final disposition in standalone |
| --- | --- |
| `e1ff72b7` wallet heading corrections | Adapted. `CardTitle` is removed from the wallet hub's Assets and Recent activity sections; each section now uses an explicit `h2` while the hub title remains the page `h1`. The richer source wallet view is intentionally not copied because standalone owns a different route-neutral hub contract. |
| `936ac657` terminal send states | Adapted. The standalone send model's existing `pending`, `success`, and `error` steps now render bounded-sheet terminal branches with status/alert live regions, icon semantics, a transaction hash, close, and retry actions. The reviewed source's multi-step Modal UI is intentionally inapplicable to the existing Kobalte Sheet contract. |
| `936ac657` bounded modal/sheet scrolling and focusability | Adapted. `SheetContent` has a viewport-height bound and keyboard-focusable overflow region; the asset list's bounded overflow region is also focusable. |
| `d8fe49a5` tracked send reset effect | Adapted. Opening the sheet or receiving new controlled defaults resets the standalone form and local terminal state through a tracked Solid effect. |
| `d8fe49a5` tracked receive reset effect | Adapted. Opening the sheet or receiving new chain/default/address props resets the selected chain and copy announcement through a tracked Solid effect. |
| `d8fe49a5` Storybook controlled-open effects | Present. The standalone send and receive stories already use the accepted source/callback form `createEffect(() => props.open, next => setOpen(next))`. |

The original source's React/legacy integration, route-specific modal steps, and
visual wallet redesign are intentionally not applicable to the clean-slate
standalone product. Runtime Storybook and axe evidence remains a separate gate;
these source-contract tests only prove that the recovered semantics remain in
the implementation.

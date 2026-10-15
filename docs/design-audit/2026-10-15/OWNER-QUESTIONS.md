# Paper design decisions still needed

These questions are for the workspace_owner, prepared by the paper_release_coordinator. The reviewed Paper queue completes the planned presentation tranches. The choices below still affect full design fidelity, and existing behavior remains until each choice is settled. Design decisions do not enable financial operations or supply missing API contracts.

1. Should dialog and sheet scrims keep their current blur, or leave the background sharp as Paper draws it? The audit explicitly leaves this choice open. A sharp scrim would be a separate change to the shared primitives, verified across both catalogs.

2. Should phone sheets and modals retain their close button, or use Paper's presentation without it? Treat this separately from scrim blur. Any replacement must keep a clear accessible way to leave; Escape alone does not serve a touch-only phone.

3. Where should an author find a song's status after leaving the after-post screen? Reviewed PR83 keeps a pending card in the community feed. Confirm that destination or specify another. The desktop processing, published, failed and review states also need their final drawings.

4. Should forward actions read Next and then Post, or keep the current Continue and Post song wording? The full-width phone footer and the way out at the top left are already ruled. This question concerns wording only.

5. Should members retain Unfollow, and should visitors retain the Profile button? These remain separate unresolved choices in the reconciliation log. Specify any intended change to each control without changing membership or permission semantics.

6. Should replies remain behind View replies, or load another way? Choose the intended interaction. Any automatic loading also needs a bounded request and pagination policy; it must not create a request for every comment at once.

7. Should community creation adopt Paper's three-page structure and circular avatar control? Confirm the intended step sequence and avatar presentation. Existing capability and upload availability still govern whether the corresponding operation can run.

8. Should Royalties use Paper's Earnings split card and Add collaborator wording? The current song step uses All earnings go to you and an Add action. The collaborator search finding a person is already ruled; the initial share for a newly added collaborator remains a separate unsettled choice. Bare-wallet recipients still need their owned contract.

9. Should Receive default to Base when it is available, or keep the existing selection policy? Default selection is distinct from the APIs needed for balances, fiat values, rewards, royalties and activity. Confirm the desired fallback when Base is unavailable.

The Study-only close mark, its 640px header and card column, automatic correct-answer progression and server-controlled Continue behavior are covered by PR85. Karaoke retains its caret and full-width header. Required-field asterisks and the required text-post title are already ruled. These are not reopened here.

Naming and Spaces wording, dialog geometry and the invalid viewport reset story remain with their existing lane. Account-free Study remains with PR62 and its reconciliation with the accepted recovery source. Wallet palm checks, live financial data, Management write sections, Dance and notifications remain contract and acceptance work in their owning lanes.

The source references are the [original Paper rulings](https://github.com/pirate-social-club/pirate-web-solid/blob/9c219817b915859398923d5ad56dd83afdedeb30/docs/design-handoff/2026-10-12/authority/paper-rulings-2026-10-09.md), the [final design handoff](https://github.com/pirate-social-club/pirate-web-solid/blob/9c219817b915859398923d5ad56dd83afdedeb30/docs/design-handoff/2026-10-12/authority/paper-final-handoff.md), the [remaining-sheets handoff](https://github.com/pirate-social-club/pirate-web-solid/blob/0b6244b7ccddc6fb1c212f230cdbd129d73e2b89/docs/design-audit/2026-10-13/HANDOFF.md), and the repository's existing reconciliation log. Preserve those historical references when recording the decisions.

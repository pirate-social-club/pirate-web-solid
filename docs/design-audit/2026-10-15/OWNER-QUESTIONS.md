# Paper design decisions

## Adopted rulings, 2026-10-16

The workspace_owner adopted the rulings below on 2026-10-16. They answer questions 2 to 9 of the original list, which is kept unchanged under [Original questions](#original-questions-2026-10-15). Question 1 was resolved earlier the same day, and that change has shipped.

Each ruling is checked against `main` at `60d8f61f`. Conforms means the code already does what the ruling says, and nothing is to change. Remaining names the work still to do. Each remaining item ships as its own reviewed PR, in the order under [Sequencing](#sequencing). This record changes no behavior.

| # | Ruling | Status at `60d8f61f` |
|---|---|---|
| 2 | Phone sheets and modals keep a visible, accessible close control. Focus, dismissal and operation guards stay as they are. | Mostly conforms; two confirmed gaps and a busy-state visibility check remain. Dialog, AlertDialog and Sheet render a close button by default (`packages/solid-ui/src/components/overlays`). The sign-in modal hides its close while sign-in is running; audit that busy presentation for a visible accessible control while preserving the operation guard. The feed side panel hides the sheet's button but draws its own close in `PanelHeader`. Remaining: two phone sheets have no visible close. One is the video feed's Report sheet (`hideCloseButtonOnMobile`, `src/features/posts/video-feed/video-feed-report.tsx`). The other is the community More sheet (`hideCloseButton`, `src/features/community/page-shell/community-more-menu.tsx`). Each needs a close control that keeps focus return and the existing dismissal. |
| 3 | Song status stays in the community feed, with a detail destination. Desktop processing, published, failed and review designs are to be produced from the existing submission states and reviewed before implementation. | Feed placement conforms. After the after-post screen (PR83), the pending card in the community feed carries the song. Remaining: the four desktop designs, to be reviewed before any implementation. The detail destination also remains: today only a published song links anywhere (to its post, `pending-songs.tsx`), and processing, failed and review states have no destination yet. |
| 4 | Composer progression reads Next, and final publication reads Post. Unrelated retry and recovery wording stays. | Remaining. The shared composer's forward action reads Continue (`copy.ts`, `actions.continue`, used by `step-footer.tsx`), and the video song step reads "Continue to video" (`video-composer-runtime.tsx`). Change these to Next, and keep Try again and the other recovery wording. |
| 5 | Unfollow is hidden for active members under Spec 016. Visitors keep Profile where it is accessible. | Conforms. Unfollow is offered only to a settled follower who is not a member (`page-shell.tsx`, citing Spec 016 §4.6). The visitor Profile control is retained. Nothing is to change. |
| 6 | View replies stays. A notification aimed at a reply must expand and locate that reply across pagination and nesting, keeping visibility and authorization. | View replies conforms (`post-engagement.tsx`). Remaining: reply targeting from notifications. It depends on the notifications inbox, which does not exist yet (see [Navigation](#navigation-and-capability-boundaries)). |
| 7 | Community creation uses Paper's three pages and a circular avatar. Saved-state recovery stays, and real upload and verification capability limits still govern what can run. | Remaining. Creation currently has two pages: details, then profile (`create-community.tsx`, following Spec 006 as amended 2026-09-20). The implementation PR must restructure it to three pages and record the 2026-10-16 ruling as the later layout direction when reconciling Spec 006, preserving the September amendment as history and leaving join-policy and creator-verification semantics intact. Avatar authoring stays behind its existing capability flag. |
| 8 | Royalties use Earnings split and Add collaborator. A new collaborator has no preset share; the share must be an explicit positive value, and allocations must total 100%. | Share rules conform. The add dialog starts with no share, accepts only a positive share within what remains, and the split must total 100% (`earnings-split.tsx`, `copy.ts`). The Earnings split title and Add collaborator wording are used once a collaborator exists. Remaining: with no collaborators, the step still shows "All earnings go to you" and a button labelled Add (its accessible name is already Add collaborator). This empty state is to move to the Earnings split card and Add collaborator wording. |
| 9 | Receive defaults to Base when Base is supported, ready and usable. Otherwise the viewer must choose a network; the balance-based fallback is removed. | Remaining. The live sheet initializes, resets and builds its view through `resolveReceiveChainId` (`src/features/wallet/wallet-receive-sheet-view-model.ts`), which honours a usable explicit default and otherwise picks the highest fiat balance. `getDefaultReceiveChainId` in the model has a similar fallback but is not the live sheet’s selector. Change the live selection path and any retained helper consistently: Base when usable, otherwise no automatic selection and an explicit choice. |

### Navigation and capability boundaries

- Search and Live remain deferred and are absent from navigation.
- The host's composer stays Song and Video only, including its overflow controls, on desktop and mobile. The generic capability code, such as the composer's Live tab, stays intact and stays unused by this host.
- Notifications gets its navigation entry together with its functional inbox. Remaining: `/activity` currently renders "Notifications are unavailable", and the header's notification action is hidden. The entry and the inbox ship together, and ruling 6's reply targeting builds on them.

### Still undecided

This batch does not decide:
- Management report detail. Paper draws a report-detail page; the app's queue uses inline cards.
- Studying Correct box (Paper 077). Correct spoken answers still advance immediately.

### Sequencing

The recorded source order:

1. Shared streak and leaderboard UI holds the first Solid slot. It is assigned and remains in its owning coordinator's review and fix cycle.
2. This record: the adopted rulings with their dated status. Docs only.
3. The four desktop song-status designs (ruling 3), reviewed before implementation.
4. Later runtime Paper and wallet changes, including rulings 2, 4, 6, 7, 8 and 9 and the Notifications entry with its inbox. Each ships as a separate PR, sequenced under the rollout coordinator's shared-source assignment.

The authority does not fix a complete internal order for every runtime slice.

Source: `tasks/records/solid-paper-adopted-decisions-20261016.md`, backed by `.archive/v1-adopted-execution-dispatch-20261016/owner-direction.json`. Both are workstation records and are not in this repository.

## Original questions, 2026-10-15

The questions as they were asked under the original title, "Paper design decisions still needed", kept unchanged as history.

These questions are for the workspace_owner, prepared by the paper_release_coordinator. The reviewed Paper queue completes the planned presentation tranches. The choices below still affect full design fidelity, and existing behavior remains until each choice is settled. Design decisions do not enable financial operations or supply missing API contracts.

1. Resolved on 2026-10-16: the workspace_owner confirmed that dialog and sheet scrims should leave the background sharp as Paper draws it. Remove their blur and preserve the existing dim. The separate phone close-control decision below remains open.

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

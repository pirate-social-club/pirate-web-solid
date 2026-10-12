# Frontend state-machine review

## What already exists

This is a read-only planning baseline against Solid `45d07cb25b3267ad16f158aa40eff7d11ad49c5e` and the current workstation task register. It proposes transition contracts, not new wire types or an approved replacement architecture. No app code, build, tests or Storybook run was performed for this plan. Refresh source and active task custody before implementation.

The existing Markdown specification is `docs/specs/api-next/013-posting-state-machines.md` in the control plane. It defines shared server posting semantics, durable identities, ambiguous request recovery and projections. The local register carries accepted amendments ahead of control-plane origin/main, so an older remote copy is not the entire current contract. This supplement does not export that long specification. Obtain its current accepted contract and generated-client binding through the owning lane before implementation. Spec 010 owns moderation and comments. Spec 012 owns community naming and Spaces; its accepted amendments and generated client are the behavior authority.

There is also `tasks/records/solid-storybook-state-coverage-map.md`, whose snapshot is in the design export. It is a planned, coordinator-owned video-composer-first coverage registration. It calls for a small typed state-to-story-to-transition-test map, not another framework. That local record is ahead of control-plane origin/main and is not a remotely admitted implementation lane. Do not reuse it as the full design reconciliation record.

Solid main already uses XState 5.33.2 through its own Solid actor bridge. Text has a shell-owned submission actor, song has a shell-owned accepted-submission observer, and video has a composer actor. Song upload/terms and low-level video capture/media adapters are distinct from those actors. Do not claim that every posting phase is already owned by one machine or start another posting rewrite by default.

| Priority | Scope | First deliverable |
| --- | --- | --- |
| 1 | HNS member naming and Spaces owner recovery | Separate transition tables bound to existing generated contracts, reviewed with the current source lane. |
| 2 | Existing text, song and video machines | Actual visible-state inventory mapped to real stories and meaningful transition tests. |
| 3 | Feed loading, refresh, pagination and identity | Request-lifetime contract and race/recovery coverage; keep playback ownership separate. |
| Later | Activity result routing and Wallet verification/return | Model after newly-earned streak, reward and verification contracts are settled. |
| Blocked | New Dance review behavior | Resolve amendment A to F, ratification and independent review before implementation. |

Use XState where nested asynchronous work, command recovery and actor lifetimes justify it. A discriminated state model with a reducer/controller is sufficient for a simple query. Review behavior and lifetime first, then choose the implementation. Avoid a single machine spanning the whole frontend.

## HNS member naming: first transition contract

The existing owners are `solid-hns-names-page-member-journey` and related naming tasks. Baseline source is `community-name-controller.ts`, `community-name-acquisition.ts` and `handle-storefront.flow.ts`. Any refactor belongs in coordination with that lane; this plan authorizes no competing writer.

Membership and name acquisition remain separate. Closing naming preserves membership and retained operation correlation. Membership and existing publication prerequisites determine posting authority; an issued HNS name is not an extra requirement for posts, comments, Study or Karaoke. Page entry, authentication, joining and typing do not confirm public linking. An explicit valid Get name action confirms the exact intended public profile and offering under the accepted Spec 012 amendment.

The machine owns local intent and observation. It never changes authoritative claim or grant state. Its scope includes the initiating account, community, persona, namespace root and exact offering revision/activation generation. A known reservation or claim retains its original keys and binding across recovery; a changed offering does not silently transfer that intent.

| Local state or observation | Trigger and guard | Allowed next action or result |
| --- | --- | --- |
| Inspecting | Entry/return with current session and community membership | Read retained intent and authoritative active grants. No acquisition command on load. |
| Editing | No unresolved retained attempt; current supported offering | Validate label. Explicit valid Get name may prepare the acting community profile and retain exact operation keys. |
| Acquiring | Owned session, intended profile and offering still match | Execute existing confirmation, quote, reservation and claim flow with saved correlation. Reuse accepted steps; do not rekey on a timeout. |
| Uncertain | A dispatched step has no definitive result | Preserve intent and keys. Read a known claim, or replay the exact command under the contract's idempotency rules. Observation failure is not acquisition failure. |
| Issuance pending | Authoritative claim reports pending issuance | Show pending and permit read/recovery. Keep the original operation; do not start a second claim. |
| Issued, host not verified | Claim includes an issued grant | Read the exact grant/host projection. Keep recovery available while serving evidence is absent or unreadable. |
| Named | Exact grant, persona, root, activation and host-generation checks pass | Show the verified public identifier. Do not infer success from another grant or a local cached claim. |
| Definitive refusal or expired pre-claim intent | Existing typed contract proves a replaceable outcome | Restore the appropriate editable error. Mint new keys only on a new explicit action after the old operation is safely resolved. |
| Session repair or scope change | Authentication failure, sign-out, account/persona/community/root change | Abort/invalidate local callbacks, clear private view state, and re-establish authority before action. Retained correlation stays inaccessible to another account. |

These are presentation semantics, not proposed API enum names. In the checked client the claim wire state includes `issuance_pending`; do not substitute a remembered task-record spelling such as `issued_pending`.

Every async completion carries the initiating scope and request generation. An abort cannot prove that a server write did not happen. New reads may update observation without replacing retained operation identity. Same-account session refresh repairs transport; another account never inherits a private pending operation. Modal visibility is independent of operation outcome. Inspect two-tab behavior explicitly; tab-local state alone is not an acquisition lock.

The first meaningful test/story traces are valid Get name to verified host; lost claim response to same-key recovery; authoritative pending to later issued; issued grant with unavailable host; offer changed before reservation versus after retained claim; session expiration followed by same-account return; account/community/persona change during a request; closing and reopening without duplicate issuance; and a second tab retaining intent during profile preparation. Confirm definitive no-effect outcomes against existing server contracts before enabling replacement.

## Spaces owner recovery: separate machines

Owner proof/assignment, namespace preparation/activation and optional address attachment have different effects and authority. Keep those boundaries. A proved or confirmed assignment does not establish delegation, wallet capability or open names. Preparation is not activation. Activation needs current server checks, accepted terms and an explicit owner action.

The existing `solid-spaces-owner-progress-recovery` task consumes durable API readback and is dependent on the naming/Karaoke consumer foundation. Baseline sources are `spaces-owner-proof-panel.tsx`, `community-namespace-settings-controller.tsx` and `spaces-route-attachment-panel.tsx`. Their signals already include request-generation, scope, poll, expiry and session defenses. Capture those protections before replacing them.

For proof/assignment, model entering or returning, reading saved roots, selecting a root, obtaining the current challenge, collecting a signature, verifying, awaiting an authoritative result and confirming assignment. Each dispatched write also has an uncertain-observation path. Return first reads server progress and resumes the exact challenge/poll identity. A local countdown requests fresh readback; it does not declare authoritative expiration or rotate a key.

Expired or superseded proof and a changed root/outpoint require current evidence. Failed observation does not prove the root changed. Multiple saved roots preserve an explicit choice. Address attachment remains independently optional, bound to its own exact command and server readback. Browser storage may retain permitted correlation, never signatures, email codes, wallet secrets or bearer tokens as a recovery shortcut.

Required traces include lost start/verify/confirm responses with read-before-write recovery, accepted and pending reload, expired and changed-outpoint proofs, two saved roots, same-account sign-in return, account/community changes, stale callback rejection, two-tab reuse, and an address attachment returning after the owner proof panel is gone. Preserve existing Origin/CSRF and generated-client boundaries.

## Posting: coverage before more machines

Inspect `text-submission-machine.ts`, `song-observation-machine.ts`, `video-composer-machine.ts`, their shell stores/session wrappers and `solid-actor.ts`. Use their real state paths in a small exhaustive typed coverage map. Map user-visible states to actual-component stories and transitions to tests. Internal transient states may map to a transition assertion or an explicit reason instead of an artificial screenshot.

Text coverage must include dialog dismissal while submitting, ambiguous response and exact-key/body retry, typed conflict/refusal, account change, pending-item placement and publication. Song coverage distinguishes submission observation, processing stages, action required, moderation, definitive failure and status-read failure. Video coverage includes guide/camera start, capture interruption, finalization, retake, review, repeated Publish, ambiguous finalize, permission refusal and cleanup. Keep backend publication/delivery and low-level media timing in their owned adapters.

The accepted text and song actors retain state in memory for their current v1 lifetime. Reload recovery is a recorded limitation, not something a shell-owned actor automatically provides. Compare this explicitly with Spec 013's durable-recovery requirements and accepted task boundaries before proposing persistence. Do not silently add storage, cancel an unknown operation on dismissal, or describe an untyped transport error as a definitive rejection.

## Feeds: collection and playback have different lifetimes

Baseline sources are `home-video-feed.tsx`, `home-feed-adapter.ts`, `signed-stream-source.ts` and profile `profile-activity.tsx`. Profile reconciliation already touches its collection controller; preserve its guards there. Avoid a concurrent feed refactor on the same files.

The collection has initial loading/ready/empty/error states, plus refresh and load-more operations. These need distinguishable observations: initial failure with no usable items, refresh failure with permitted existing items, pagination failure with existing items, exhausted cursor and stalled/repeated cursor. A redacted or age-locked response is not an empty successful feed. Use only distinctions present in the reviewed contract; report any adapter information loss rather than synthesizing counts.

Each result is bound to feed identity and a request generation. Identity includes the applicable account/capability scope and resource/filter. Repeated load-more clicks join or ignore an in-flight request. Refresh invalidates an earlier page append; responses from an old filter, profile or account cannot populate the new feed. Cursor history prevents infinite repeated pages and duplicate rows. Failed pagination retries the same cursor and keeps accepted items.

An authenticated-to-anonymous or different-account transition discards prior private projection data and pending callbacks. The public-first Home surface may retain independently public data while session resolution is pending or fails. Same-identity refresh may keep permitted accepted items visible. Do not equate a transport session refresh with a new account or retain another account's private items as stale content.

Playback is a per-item owner: attachment, signed-grant request, ready/playing/paused, ended/refused/expired and disposed. Preserve stable item identity across collection refresh, dispose subscriptions and media effects when an attachment exits, and fence late signed-source results by attachment and capability scope. Refreshing a feed must not restart every player or attach an old token to a new scope. Do not move this lifetime into the collection machine merely for one diagram.

Required traces are initial empty versus failed versus locked-only response; load-more error and retry; duplicate page and repeated cursor; refresh racing page append; profile/filter switch during a slow request; sign-out/account switch during a signed grant; same-account session refresh; stable player across a row refresh; and late grant after item disposal. Choose a new runtime machine only if the existing controller cannot express or verify these invariants clearly.

## Next behavior review

Begin with the member-naming transition contract above, comparing it to the current naming lane and generated client. Establish the state/story/test map without editing that lane. Then review Spaces owner recovery with its existing task. Storybook work can proceed on settled presentation while these behavior contracts are checked. Result routing and Wallet verification follow when their server facts and return contracts are known. Dance remains a separately blocked specification dependency.

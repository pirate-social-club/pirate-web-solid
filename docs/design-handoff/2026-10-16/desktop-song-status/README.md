# Desktop song status: review corrections, 2026-10-16

This revision answers the workspace_owner review of bd2f371dd9a6f6a74f1ade50dcef20405e0fdf53. The four state cards were approved as drawn. Their body copy, icons, 448px minimum height, 24px padding and action conditions remain. The first proposal and its evidence remain reachable at that immutable commit; this is a linear design-handoff successor, not a rewrite or runtime release.

## Corrected page geometry

The drawings use the existing CommunityPageShell at accepted source594c493030c9d33f91de652a1b5cd18a454fa019. At1280px the page container is1152px. Its grid has32px horizontal padding, a32px gap, a320px About rail and a736px main column:1152−64−32−320=736. The224px banner and the community overview with96px avatar remain while the detail is open. The feed tabs and Post action follow the existing composing rules. Community name, counts and description are illustrative fixture content.

No page-layout change or new fixed card width is proposed. PostedSong already uses w-full inside the fluid main column. Do not introduce a640px or fixed736px cap. The captures are1280×1200 so the real banner/header and complete card can be reviewed together. The same widths and448px minimum card were also checked at1280×900, where vertical scrolling is expected.

View [Processing](processing.png), [Published](published.png), [Failed](failed.png), and [Review](review.png). The approved cards now sit in their actual surrounding layout.

## Feed and control decision

Retain the existing PendingSongs article and all its controls. Add a separate Status button beside its existing action row; the article is never a button. Give the article the song title as its accessible name and current status as its description. The visible Status command has an accessible name such as Status for Night tide and references that same current status description. This preserves both its visible label and the title in the command name. Native post links and all other controls are siblings, never children of this button.

| Existing content or control | Placement and condition retained |
| --- | --- |
| Published song title | Native anchor to server postHref, with rel=external; a separate Status entry is available only while the submission is retained. |
| Processing status and phase bar | Existing feed row and four-phase semantics; no fabricated progress or new timing promise. |
| Try processing again | Feed action only for retryable failure; keep rerunning/loading guard. The approved detail retains Try again under the same permission. |
| Check now and Stop watching here | Existing slow-check feed section and callbacks. Processing detail shows Check now only when slow, as before. |
| Dismiss | Existing attention states excluding manual review; removes local watching only. Do not move it away or hide it behind Status. |
| Original-song binding | Existing feed form when action_required and actual bind capability/callback permit it; keep positive authorization, input, binding and error guards. |
| Unconfirmed original request | Keep the disabled original input/submit, the repeat-same-request control and the check control. Do not substitute a fresh binding request. |

View the feed examples: [Processing](feed-processing.png), [Published](feed-published.png), [Failed](feed-failed.png), [Review](feed-review.png), [slow checks](feed-processing-slow.png), [original required](feed-original-required.png), and [unconfirmed original](feed-original-unconfirmed.png). Open index.html locally to inspect these conditions. Extra original cases illustrate the existing PendingSongs fallback; they are not a fifth newly designed state card. Do not add a recursive Status command inside that detail fallback.

## Reload and identity decision

Choose option(a): the status entry and detail are session-only for this tranche. The application-shell store is memory only. Same-application navigation may keep its entries; reload does not reconstruct them. Do not add localStorage, sessionStorage, a persisted URL or a my-submissions API dependency. A durable author-submissions read is separate future contract work. No reload recovery is claimed by these drawings or by their prototype checks. The prototype’s state query chooses a drawing only, contains no submission identity and re-seeds illustrative fixtures when opened; it is not an application recovery route.

Copy clarification, 2026-10-16. The sentence beneath the feed actions in the drawings, "Reloading or stopping watching removes this status entry here. It does not cancel the submission.", is a review annotation explaining the session-only contract. Leave it out of the shipped pending card in every state, including states with Dismiss or Stop watching here. Keep the current product copy and action labels. The drawings do not add a conditional footer-copy requirement.

Keep account/community scoping, pause/resume and explicit session-clear behavior as they actually exist. Dismiss and Stop watching remove the local entry without cancelling the server submission. Explicit dismissal must also clear any selected key and last report, so the new detail entry cannot revive a dismissed song. Closing only closes the detail and leaves observation running.

Published reconciliation can remove the pending entry once the ordinary community feed carries the post. An already-open screen may keep the same-account last report as existing PostedSong does; closing it must not recreate a Status entry. The ordinary published post and its native destination remain available independently.

## Focus, links and implementation handoff

Adopt Close song status on PostedSong in the same small runtime PR and update only the affected stories/selectors. Opening Status selects only the retained accountId/submissionId; it never adopts, reserves, finalizes or retries a submission. It focuses that Close control. Closing restores focus to the specific originating Status entry when it still exists and is authorized. If dismissal, published reconciliation or another legitimate transition removed it, use the existing Post/feed fallback. Never focus another account or community's similarly named entry.

View song remains a native anchor using server postHref and rel=external for a full page load; do not replace it with a button or a client-generated route. The isolated prototype uses the existing PostedSong story fixture /posts/song-post-1 for link semantics and intercepts clicks only to avoid navigating its local drawing. That interception is not runtime direction.

The existing cloud Paper writer retains source custody. The next small PR adds the feed Status entry and its owned key selection, preserves the existing pending controls, updates the close label/focus behavior, and adds integration stories in the real community shell. No new mutable local product checkout or capacity exception is opened. Shared activity priority and the rollout coordinator's sequencing remain.

The runtime stories must cover all four states in the real736px column at1280px, native published links, slow checks, retryable/non-retryable and busy retries, review's alternate copy, original binding and uncertainty, explicit dismissal, published reconciliation, focus fallback, new-store/reload absence and account/community isolation. Assert accessible names and descriptions and that controls are not nested. Reuse the retained account/submission identity and existing callbacks. Runtime source still needs focused checks, maintained verify/full hosted Storybook, exact-source review and protected integration; prototype checks do not satisfy those gates.

## Evidence and limits

[Source mapping](design-source-map.json) binds the seven relevant source files at594c4930. [Visual checks](visual-checks.json) record geometry, conditional controls and Chromium accessibility-tree names/descriptions from an isolated local prototype. These are not product tests, real reload/device checks or production smoke. SHA256SUMS covers every other file in this revision. The first revision's authority, PayStep evidence and sealed acceptance records are unchanged. No source capability, credential, finance operation or deployment is changed. Preserve Song/Video-only host controls and the unrelated owner-decision holds.

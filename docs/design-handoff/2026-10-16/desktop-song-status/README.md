# Desktop song-status proposals, 2026-10-16

These four drawings complete design preparation assigned by the adopted Paper batch. They are proposals for review before runtime implementation, not claims of approved artwork, implemented behavior or production acceptance. Open index.html locally to switch states and inspect Close → feed card → same status detail. The prototype makes no network or financial requests and stores no account data.

The desktop column is 640px and the status card has the existing 448px minimum height, 24px padding, visible close control, product tokens and current PostedSong copy/actions. Processing, Published, retryable Failed and Review each have a separate 1280×900 drawing. The existing published post destination must remain available, while a new detail destination follows the retained account and submission identity. No route URL or API contract is invented. The sample community and song title are illustrative.

The processing drawing freezes its spinner for deterministic review. The slow-check explanation and Check now are conditional actions. Failed only offers Try again when the actual state is retryable and respects the existing busy guard. Review retains the moderation-unavailable alternative copy. Other terminal states retain their current fallback. These conditions are documented in design-source-map.json and must be covered in subsequent runtime stories.

The cloud Paper writer retains source custody. The rollout coordinator sequences later implementation after shared activity work; this package opens no mutable product checkout and claims no slot. Production remains separately recorded40123b65, Worker69e2892f. Source-only PR90/91/92 acceptance is distinct from serving bytes. No credentials, financial activation, navigation entry or deployment is authorized by these proposals.

The next handoff is review of these drawings and a small cloud runtime tranche preserving Song/Video-only host controls, account fences, recovery and actual server states. The owner decisions are already authority; no renewed ruling is required. Management report detail and the Studying Correct box remain outside this batch.

View [Processing](processing.png), [Published](published.png), [Failed](failed.png), and [Review](review.png). The [feed preview](feed-review.png) illustrates the detail entry. [Visual checks](visual-checks.json) record the measured geometry and isolated prototype interaction.

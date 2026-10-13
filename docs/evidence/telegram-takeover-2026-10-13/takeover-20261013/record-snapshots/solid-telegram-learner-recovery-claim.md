id: solid-telegram-learner-recovery-claim
title: Phase two - deliver independent Telegram recovery and confirmed-winning claim screens
status: planned
repository: pirate-web-solid
area: identity
parent: telegram-study-first-amendment
priority: normal
worktree:
branch: feat/telegram-learner-recovery-claim
owner_role: workspace_coordinator
coordination: exclusive
blocked_by: telegram-post-lesson-account-connection-spike, api-telegram-learner-recovery-claim
updated: 2026-10-09
closed_at:
review_after: 2026-10-20

This proposed phase-two Solid handoff follows
[practice-first copy](solid-telegram-study-first.md) and the reviewed
[API recovery contract](api-telegram-learner-recovery-claim.md), under
[the draft amendment](telegram-study-first-amendment.md). It registers future
source scope rather than ratifying policy, authorizing implementation or enabling
Rewards. Use governed repository admission after the phase is owner-approved.

Implement independent Telegram recovery into the existing restricted learner
account with no separate Pirate signup prerequisite. Show Pirate's login client,
keep browser transaction continuity, and consume the same-origin api-next-issued
HttpOnly session after proof. Recovery can serve practice-progress management
before money is live. Existing-account connection remains an explicit authenticated
account/persona/per-bot-consent flow; do not collapse conflict or ownership checks.

Prepare stories before copy for recovery entry, pending Telegram approval,
recovery success, unknown/conflicting identity, no website recovery evidence,
expired/cancelled/replayed/wrong-browser/provider failures, existing-account
connection and monetary-history conflicts. Add actual confirmed-credit states:
claim evidence needed, legal-policy refusal, subject conflict, claim accepted,
recipient pending, payout pending and confirmed. Clearly label fixtures and
avoid provider contact or wallet creation from stories.

Show confirmed amounts only after the API confirms custody/credit. Before that,
show actual share/drawing outcome without estimates. Distinguish Telegram account
proof, Very claim evidence and pool legal eligibility. Provider-subject uniqueness
is not one verified human. Explain held unclaimed amounts and limitations of
account connection; do not promise moving past study, merging monetary histories
or redistributing duplicate shares. Phase-one practice remains non-rewarded.

Keep the common optional Connect an existing Pirate account action independent
of reward availability. Use truthful per-lesson eligibility/status messages,
without revealing private association lookups or making connection universally
necessary to earn. Any accepted chat attestation path and disclosures come from
the applicable policy/API contract, not client-invented approval.

Maintain state-bound callback/query cleanup, no-store/no-referrer and protected
same-origin cookie/Origin/CSRF policy. Unsupported embedded flows restart safely
in a supported destination browser; no token, verifier or persistent grant is
carried by the bot or localStorage. Keep return/resume coherent for the same
community and persona. New wallet preparation reuses the frozen share persona.

Verify focused route/state, SSR/hydration, session/CSRF, Storybook build and
appropriate type/lint/build/generated-client provenance gates. Real iOS/Android
Telegram and system-browser recovery, sender-id/nonce and claim/recipient trials
remain separate acceptance. Follow sanctioned publication and guarded release
paths after admission. Production or fund activation requires separate authority.

Dependency correction, 2026-10-09. The workspace_owner instructed the coordinator to run the account-connection investigation. The phase-one specification is complete and the optional old Solid practice-copy task is not a prerequisite for the new recovery journey. Depend on telegram-post-lesson-account-connection-spike and api-telegram-learner-recovery-claim, not parked phone acceptance or that superseded copy task. Provider selection and the reviewed API/session mapping must precede this source lane. This correction authorizes no monetary activation, credential operation or production change. The connection page must not reintroduce the removed 16+ assertion.

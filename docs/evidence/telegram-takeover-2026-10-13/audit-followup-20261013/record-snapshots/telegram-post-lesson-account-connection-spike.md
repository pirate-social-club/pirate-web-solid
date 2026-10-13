id: telegram-post-lesson-account-connection-spike
title: Resolve post-lesson Telegram account connection and Privy support
status: planned
repository: pirate-workspace
area: identity
parent: api-telegram-http-practice-regression
priority: high
worktree:
branch: research/telegram-post-lesson-account-connection
owner_role: telegram_coordinator
coordination: exclusive
blocked_by: none
updated: 2026-10-13
closed_at:
review_after: 2026-10-17

The workspace_owner asked how authentication maps Telegram learners to Pirate
accounts and identified lesson completion as the natural place to offer it.
Investigate Privy Telegram support using current official documentation and the
installed integration, compare legacy behavior read-only, and inspect the current
Pirate-controlled Telegram login and its origin defect. Produce a concrete
connection/recovery design before implementing a third completion button.

Coordinate with api-telegram-learner-recovery-claim rather than duplicating it.
Distinguish recovering the same restricted practice account from connecting an
already authenticated existing account. Prove the same numeric Telegram identity
independently of community-bot token custody, preserve original account/persona
and lesson history, and specify association conflicts and safe future routing.
No silent history transfer, balance merge or practice reward backfill is admitted.

The result must resolve whether Privy can establish the required independent
identity when entered from community-owned bots. A successful phone-input form
or launch-data signature alone is insufficient. Include new users, existing
accounts, wrong Telegram identity, replay, cancellation and cross-browser cases.
Practice stays available before sign-in. This is a planned investigation, with
no provider configuration, production, Rewards or fund activation.

Initial read-only findings, 2026-10-08. The installed Solid SDK is
@privy-io/js-sdk-core 0.70.0; its TelegramApi provides authenticate, link and
unlink for Mini App data or Login Widget/LoginUrl auth results. This establishes
available SDK support without a React dependency or an upgrade. Current Privy
OAuth documentation confirms Telegram authentication/linking; the older guide
redirects there. Telegram's LoginUrl bot_username can select a Pirate-controlled
authorization bot independently of the community bot sending the button.
Combining that capability with Privy is a candidate, not a proven provider flow.

Legacy's auto-exchange route validates Mini App data with community/context bot
tokens, exchanges the numeric identity for an account and mints a session. The
current trust boundary does not admit community-controlled HMAC proof as login.
Current website Privy exchange requires explicit registration for an unmapped
Privy subject, so recovery must be resolved before generic registration creates
a second Pirate account. Preserve practice ownership and history, distinguish
existing-account connection, verify the same numeric sender independently, and
handle conflicts without silent merges or reward backfill. Spec 026 currently
selects Telegram OIDC; replacing it requires a reviewed contract amendment.

The remaining spike must prove the real central provider flow and backend
account mapping before offering a post-lesson Connect action. No authentication
or provider configuration changed. Full source locations, official links and
unproven items are in auth-spike-findings.json in the staging archive package
telegram-practice-ending-2026-10-08. This planned task coordinates the existing
api-telegram-learner-recovery-claim lane rather than duplicating it.

Owner-directed policy prerequisite completed, 2026-10-09. The workspace_owner removed the platform-wide full-account 16+ requirement. Specs 006, 014 and 026 are amended, API PR 591 is merged and its HTTP policy is live on staging, and Solid 9c280360 serves proof-only registration without the declaration. Connecting a practice account must not collect or fabricate a 16+ assertion. Existing historical rows remain; Telegram's general-only songs and independent adult_18 access stay separate without a new age ceremony. This resolves the account-age prerequisite only. The central Telegram identity proof, provider acceptance, recovery/association rules and post-lesson Connect action remain the planned investigation above; no credentials or connection flow were implemented.

Coordinator pickup, 2026-10-09. The workspace_owner instructed the coordinator to run the Privy-first investigation, repair the recovery dependencies and register the security/review follow-ups. This session is the sole investigation writer. The record now belongs to the control plane because this lane produces a reviewed research/design handoff, not API source. Its normal documentation worktree does not consume or raise an API/Solid slot. Source implementation remains in the existing API/Solid recovery records after provider proof and reviewed contract selection. No production, Rewards or credential creation/rotation is authorized here.

Inspect existing provider configuration read-only and prepare a bounded test flow before asking for specific dashboard help. A real Telegram approval and final phone acceptance require the workspace_owner's participation. Do not describe that practical requirement as another general approval. Do not assume BotFather or Privy settings need changing before inspecting them. Record any proposed changes concretely; the standing exclusion for credential operations still applies.

Acceptance covers new-user recovery into the same account and completed lesson, explicit connection to an existing account with stable history attribution and coherent future routing, wrong Telegram identity refused without mutation, replay/cancellation/wrong-browser handling, and Connect hidden once connected. An existing Pirate login plus independent Telegram proof may both be needed; one sign-in is a goal, not an established property of either provider. The shipped native linking path requires a Pirate session, while the proposed native recovery would issue one after Telegram proof. No button is promised before its full path works.

Provider setup clarified, 2026-10-09. The workspace_owner supplied the Privy dashboard fields and explicitly confirmed that no OAuth credentials have been provided. The public application configuration changed only telegram_seamless_auth_enabled to true; telegram_auth and telegram_oauth remain false. The checkbox is not a working login. Privy specifies https://auth.privy.io/api/v1/oauth/callback as the Telegram client Allowed URL, distinct from the still-unimplemented Pirate probe return page. Existing Pirate-controlled client credentials must go directly into staging app cmsw5pis300b80cladbxx7bsr through the approved provider/store workflow, never through chat or evidence. No credential operation, real provider approval or staging mutation occurred.

Research source is docs/reviews/telegram-account-connection-spike-2026-10-09.md on research/telegram-post-lesson-account-connection at 69898316dfa220faa63c99456a72cb7851049a5c. Sanitized public evidence is .archive/telegram-account-connection-spike-2026-10-09/. Source inspection establishes the generic registration duplicate-account risk, full-session profile/first-wallet readiness requirement, migration 0246 ordinary-Study restriction, and memory-only OAuth redirect continuity gap. The planned isolated probe must explicitly disable both embedded-wallet createOnLogin options. None of those findings implements recovery or selects a new accepted contract. Independent exact-source review is finishing. The actual probe and real phone proof remain open; do not describe account connection as built or ready.

The recovery dependencies were corrected to this spike and then API recovery. New planned follow-ups are solid-seroval-runtime-security-update and api-telegram-practice-delivery-hardening. Registering them did not repair those findings. The current investigation worktree remains active and is the only source writer; product source work has not started.

Research review accepted, 2026-10-09. The independent reviewer accepted exact 69898316dfa220faa63c99456a72cb7851049a5c after correcting the ordinary-Study transition and explicit probe wallet-creation boundaries. No material findings remain in that documentation. Review accepts only a research checkpoint; OAuth configuration, the actual probe, numeric-identity proof and account connection are unproven. The sanitized review and exact research copy are research-review.json and reviewed-research.md in the named archive. bin/tasks-check exited 0 with 1063 task files valid and 204 existing review-date warnings; git diff --check passed for the research source. No product code changed and nothing was deployed in this investigation. The missing OAuth credentials are a confirmed setup prerequisite, not inferred from the Mini App toggle.

Provider setup confirmed, 2026-10-10. The workspace_owner configured the separate OAuth Client ID and Client Secret directly in Privy's staging dashboard and confirmed that both were saved and Telegram OAuth was enabled. An independent public configuration read at 2026-10-10T10:10:13.871454Z returned telegram_oauth=true, telegram_seamless_auth_enabled=true and telegram_auth=false for staging app cmsw5pis300b80cladbxx7bsr. The false legacy Widget flag does not invalidate the OAuth setup. The Pirate-controlled authorization bot is @staging_oauth_bot and the owner configured Privy's provider callback https://auth.privy.io/api/v1/oauth/callback in its Login Widget settings. No credential values were read, copied or logged. This supersedes the earlier missing-OAuth setup prerequisite, but proves no real provider login, numeric identity or account recovery.

The isolated source task solid-telegram-privy-identity-probe is registered as planned. Normal bin/worktree-open has repeatedly refused its admission because solid-hns-names-page-member-journey has an overdue unpublished-work checkpoint. Verified complete-history captures at 44fedc5651e253258845a4742eb6d3ddd631ef45 and 940678a767d93b32a0f0f355c13ca576f3e6aef6 protect the foreign branch, but current workspace-check does not allow captures to satisfy Solid's publication checkpoint. The latest refusal states: "Target pirate-web-solid: 1 blocking breach(es)". No product worktree or probe source was created. Do not change publication policy, publish unreviewed foreign work, reuse another writer's checkout or create a duplicate application to bypass admission. The separately recorded shared source/publication/staging quiet custody through 12:00 UTC October 10 also requires actual compatible handback; its expiry alone does not release resources. This is an internal implementation and custody block, not a request for renewed owner permission or credentials. Exact admission outputs are retained in .archive/telegram-account-connection-spike-2026-10-09/probe-admission-after-successor-checkpoint-2026-10-10.log.

Current probe handoff, 2026-10-10. The foreign publication checkpoint cleared and normal admission created solid-telegram-privy-identity-probe from website main0801168. Its source is now built and independently accepted at95a6991d2e5e5e83618300174b6f1f0300783785, with local owning gates and staging build passed. The page uses existing verification config, memory-only SDK tokens and a bounded same-tab PKCE continuation. It adds no Worker-side config/verifier, identity-token switch, popup, embedded wallet or account mutation. Its browser result is explicitly not server verification. This supersedes the earlier admission-blocked and unbuilt-source statements without accepting Privy as the platform linking provider.

The exact Radicle feature patch is b9e8d15f9f20f396602649a311d9b8c98c76acc7, created locally but not delivered to the CI seed. Recovery of the disconnected local transport stopped the node, and startup refused the unavailable encrypted-key passphrase. The owner has been asked to start it in a local terminal without sharing the passphrase. A read-only seed-delivery watcher runs until19:00:13.755641 UTC; it cannot resume this chat or establish CI, deployment or provider proof. The reviewed readiness record and local-gate logs are in the existing spike archive. Actual exact CI, main/staging handback and guarded release still precede the one phone link. A real Telegram-browser OAuth return and managed lookup matching the original practice sender, observed subject hash and provider verification time remain unproven. Account recovery, existing-account association and the post-lesson Connect button are still not built. No further general approval or OAuth dashboard change is pending.


Governed capacity return, October 11. The workspace_owner accepted the revised staging plan and instructed the coordinator to pursue it. The exact reviewed research checkpoint 69898316dfa220faa63c99456a72cb7851049a5c and its registered complete-history capture were verified before the maintained worktree-close command parked this task and returned its control slot. No research history or evidence was deleted. The specification integration takes priority; provider proof, recovery implementation and Telegram runtime acceptance remain open and can resume after the shared contract is accepted. This is actual source checkout retirement, not an expiry-based resource handoff. No production action or credential operation occurred.


## Telegram ownership resumed, October 13

The workspace_owner explicitly asks this local session to take ownership of Telegram while cloud completes guest learning PR 598. The telegram_coordinator in session 01a13380-3a24-74b3-a6fa-ae35e508411e owns this investigation, the parked Solid identity probe and Telegram-specific follow-ups. This supersedes the October 11 pause for independent provider investigation only. Spec 027 explicitly permits that investigation in parallel. Cloud keeps guest learning, accounting, shared schema/migration/client custody and its source branches; prospective recovery adapters consume the accepted frozen handoff before implementation. Historical practice sessions remain reward-free. No cloud branch is adopted or modified.

The immediate step is to reopen the independently accepted page-only probe 95a6991d, reconcile it with actual accepted Solid main 45d07cb2 in its own admitted checkout, and refresh source gates/publication readiness. A fresh read confirms the local Radicle node is now running and connected, superseding its October 10 stopped-node observation. Actual seed delivery, exact CI, compatible staging custody, guarded release and real Telegram phone/provider proof must still be established. The source expires at 2026-10-17T00:00:00Z; no extension is inferred. OAuth credentials were already configured and are not requested again. Account recovery/association/Connect are still unbuilt.

The separate delivery-hardening admission was attempted and refused on October 13: api-next has 5/5 auxiliary slots occupied and its retained local guest-interface branch has an overdue publication checkpoint. No API source checkout was created. Its findings can be inspected read-only while probe work proceeds in Solid. No cloud agent has been contacted by this session, and this local record does not claim a remotely acknowledged handback. Production remains paused.


Cloud audit correction, October 13. PR598 at ae602637c97d4009bdcc78d26b173dcf49873543 includes06ff456345e9a889a49018aafce486587b13acf5 in the Telegram enrollment path. Its transaction takes global topology lock83000003,1 before community/integration/learner locks and provisions the original account participation owner during new-account birth. Cloud retains shared adapter/schema/client custody until an accepted frozen handoff. Recheck delivery findings against that exact successor and full shared Study delta, not main alone. Real phone acceptance must bind actual HTTP/jobs source and versions to the composed release containing the accepted change, including fresh webhook enrollment, practice-only attribution, completion/ending and existing progress/Resume. No cloud branch, API source or serving state was edited for this audit.

The original full phone trace belongs to PR588 source5ac53087, before PR590b833's later deployment. Neither historical trace nor synthetic recovery certifies the future composed source. The additive cloud package docs/evidence/telegram-takeover-2026-10-13/audit-followup-20261013 on handoff/telegram-audit-20261013 records refreshed GitHub checks, source diffs and corrected evidence qualifications.

The bot name and callback setting remain owner-reported; no raw app/client/bot/callback binding read is in the package. Public flags establish neither those settings nor real provider proof. Obtain sanitized managed readback and the real return/cancellation/identity-freshness ceremony before contract selection. The raw October10 provider receipt remains unavailable. No new credential entry or renewed general approval is implied. The probe expires at2026-10-17T00:00:00Z; expired execution must stop or use an explicitly reviewed source successor with a recorded new expiry.

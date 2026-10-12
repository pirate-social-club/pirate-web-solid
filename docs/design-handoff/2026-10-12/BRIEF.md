# Pirate Storybook reconciliation brief for a cloud agent

The cloud agent has no Paper access. This package contains the design references needed to work without it. Start with the shared post card and the single profile posts feed. Those are the first proposed implementation slice; later slices depend on contracts and product decisions that remain open.

## Scope and authority

The workspace_owner authorized the design export and public publication on a dedicated handoff branch on 2026-10-12. This authorization covers distribution of the reference package. It does not explicitly supersede the reported 2026-10-11 instruction to stay in Paper until nothing is uncertain. Before implementation dispatch, the coordinator must record an explicit owner instruction releasing the post-card/profile slice from that restriction and register its own authoritative task record. `proposed-task-record.md` is a draft, not dispatch authority. Do not treat this package as a renewed approval question for work already authorized elsewhere.

Use `authority/paper-final-handoff.md` for the final 2026-10-12 design status. Its opening current-state section supersedes historical “not drawn” lists later in the same document and stale lists in sheet captions. Owner decisions recorded there outrank earlier design suggestions. Proposed behavior remains proposed. This package preserves the older captions so conflicts remain visible.

The reference Solid source is `45d07cb25b3267ad16f158aa40eff7d11ad49c5e` on GitHub main. The workstation checkout remained at `0801168a8344e66fdccdb8fc3298251e6abb69cc`, 27 commits behind and none ahead. The reference revision contains 62 app story files. The earlier successful parity check covered 60 files at the workstation revision; it was not rerun at the reference revision. Source count, import reachability, rendered visual parity and interaction coverage are separate evidence.

The API reference is `e8628c82d7d3827e69e13641538e2ba7c08bfd80`. Solid at the reference revision pins generated client `0.114.0-a2eb47a5`. Recheck reference freshness and read the actual repository instructions before writing. The included task and specification snapshots provide context. Workstation-specific instruction snapshots are omitted from the public package. Read the current AGENTS.md in this repository before writing; the snapshots do not replace current dispatch authority or establish a publication route for a new implementation lane.

## Read the exports

`DESIGN-INDEX.csv` maps every sheet to an overview PNG, readable individual state PNGs where available, full captions and exact JSX/style references. `reference/captions.json` preserves complete captions and group labels. `reference/jsx/*.jsx.txt` includes complete screen text and inline design styles for every non-index Parts, Flows and Screens sheet. These are reference exports to translate into Solid, not application components to paste wholesale.

`reference/tokens.css` contains the exact color, font, spacing, radius and breakpoint tokens. `reference/first-slice-computed-styles.json` supplies measured styles for the initial card/profile variants. Use existing design-system components and icons. Screenshots verify appearance; exported styles and tokens supply values.

Start with these images:

| Design | Image |
| --- | --- |
| Text card | `states/Parts-Posts-PostCard--013--PostCard-kind-text.png` |
| Song card | `states/Parts-Posts-PostCard--014--PostCard-kind-text.png` |
| Video card | `states/Parts-Posts-PostCard--015--PostCard-kind-video.png` |
| Own profile | `states/Screens-Profiles-Profile--205--Screen-mobile-profile-own.png` |
| Own profile without handle | `states/Screens-Profiles-Profile--206--Screen-mobile-profile-own-no-handle.png` |
| Visitor profile | `states/Screens-Profiles-Profile--207--Screen-mobile-profile-other.png` |
| Desktop profile | `states/Screens-Profiles-Profile--209--Screen-desktop-profile-own.png` |
| Reward pill variants | `boards/Parts-Rewards-RewardPill.png` |
| Card variants together | `boards/Parts-Posts-PostCard.png` |

The source song-card layer is mistakenly named `kind=text`; the second card is the song variant. The export preserves that layer name. Placeholder author handles, scores, amounts, dates, images and daily marks are fixture content, not facts to reproduce in live views. The package also contains profile Edit as reference; editing is outside the first slice.

The profile screenshots also show the five-destination footer and reward pills. Those are intentional reference differences while Notifications and live Rewards remain outside this slice. Record them explicitly in visual review rather than implementing those later features to make a screenshot match.

## First slice

Extend `src/features/community/page-shell/page-shell.tsx` and its owned presentation model to support the video kind alongside song and text. Keep one author row and one engagement row. A text card has title/body; a song card has its playable song tile; a video card has its poster/player. Preserve the existing vote, comment, report, age and permission controllers. Do not change reporting capabilities merely because all kinds share a card.

Trace `projectCommunityThreadPost` in `src/features/communities/community-page/community-thread-feed-api.ts` and the existing generated media reads. Its current projection maps every non-song item to text. Bind video rendering only to fields those reads actually provide. A missing playable-media projection is a dependency to report, not permission to invent a wire type or synthesize a media URL.

Replace the three tabs in `src/features/profiles/profile-page/profile-activity.tsx` with one newest-first posts feed using the existing Posts surface. Use the same card as the community feed, with song, video and text together. Do not list comments on profiles. Keep the current identity, visibility, pagination, session and stale-response protections. The profile remains unfollowable; preserve owned-profile actions and visitor permissions.

The reward pill is a gift mark plus the number of available activities. It is not money or an earned reward, and a text post has none. Its design replaces Boost in the author row. Rewards are disabled everywhere in the supplied handoff. Consequently the pill and its destination remain explicit fixtures until the real capability/count projection and an authorized live reward surface exist. Preserve existing authorized sponsor entry points; any relocation must not silently remove the last working entry point. No fake count or enabled reward claim belongs in a live feed.

## How Storybook fits the app

For existing route-reachable components, edit the shared component and its stories in the same commit. This changes the app source immediately. Storybook is the review and test surface; there is no later second implementation to copy into the app. Deployment remains a separate governed step.

The proposed new stateless reward-pill primitive belongs in `packages/solid-ui`, with package stories using explicit presentation props. It has no API calls or money logic. The design-system catalog is exempt from the app-story production-import rule. Its eventual app adoption uses the real capability projection and runtime guard.

New feature screens such as Notifications, streak leaderboards and Dance results belong in app features. Add their app stories with the production route/component wiring in the same accepted slice, after reviewed generated contracts and prerequisites exist. A deliberately isolated pre-routing app preview instead requires a specific recorded allowlist reason and review. No blanket exception is proposed here. Story-local imitation markup is not an implementation the app can adopt.

`check:story-parity` is part of lint and checks app-story imports against production reachability. Keep it intact. An existing story title or passing import check does not prove that a state is reachable, correct or visually matched.

## Later slices and their prerequisites

| Slice | Prerequisite or limitation |
| --- | --- |
| Study answers | The 10-12 rule is explicit: correct advances automatically; incorrect pauses for Continue. Review both spoken and choice controllers. Do not generalize the prohibition to Continue between result pages. |
| Completion sequence | Result always precedes optional Streak and optional Rewards. Existing code keys the streak replacement on `qualifiedToday`, which does not identify the attempt that newly earned the day. |
| Streaks | `rewards-activity-ui` owns song/community streaks and leaderboards. Existing leaderboard endpoints do not supply the absent seven daily marks or a newly-earned signal. The 09-23 record reports no streak mapping in the live Study adapter; trace current wiring before claiming the page appears. |
| Karaoke disclosure | `solid-karaoke-first-use-disclosure` is complete. Preserve the capture gate and approved provider/platform retention disclosure. Paper's proposed shortened wording does not reopen an invented outstanding terms-review gate and must not silently remove required facts. |
| Comments | One-level replies and newest-first top-level pagination need reviewed server/contract changes. Replies remain oldest first. Flatten historical depth without losing authors or “Replying to” context. Comment voting has no endpoint. The Reply button on reply rows remains a design choice. |
| Notifications and fifth tab | A stored/read notification contract, unread behavior and result destinations are absent. Wire the fifth tab with a functioning Notifications slice; exposing the unavailable placeholder is not completion. |
| Send and Claim | Palm-gated Send needs server enforcement and a typed verification purpose/return. Claim recovery must restore the earning profile and resume the intended win once. Claimed, Paid, pending and unknown outcomes stay distinct. |
| Reward results | Fixture references only while Rewards is disabled. Resolve later entry-status access and the existing-entry-plus-new-cash variant. Do not equate a status-read timeout with no reward. |
| Dance | Resolve amendment open items A to F, ratify the conforming specification changes and obtain the required second independent review before any Dance code starts. Eligibility and verification timing remain open. |

Do not reuse `solid-storybook-state-coverage-map` as this lane's record: it is the coordinator-owned video-composer-first coverage registration. Reconcile later streak work with `rewards-activity-ui`, which excludes Dance and Megapot. The Dance amendment and API implementation have their own records. The first slice needs the separate proposed record included here.

The Dance design now publishes a chosen public attempt only after a pass and provides result pages reachable from the private latest-attempt row and Notifications. Older amendment text says publication is independent and there is no verdict screen; the newer owner decisions must be recorded before implementation. Daily participation also conflicts with one waiting attempt per dance/revision and a seven-day review. Submission-day streak credit and pass-day lottery admission are separate rules; a late verdict cannot enter a closed drawing. A pass must not imply a payout.

When those later contracts are ready, model completion routing, verification/return, send/claim recovery and Dance review explicitly. Enumerate pending, confirmed, failed, unknown, timeout, retry, exit and resume transitions. Preserve request identity on ambiguous retries, bind responses to the intended account/profile/resource and never resubmit an activity merely to reread its reward status. Use meaningful controller/transition tests and actual-component stories rather than introducing a framework or rewriting existing machines by default.

## Acceptance for the first slice

Review the actual card and profile compositions against the individual phone and desktop exports, including long text and narrow layouts. Exercise existing voting, comments and permission behavior after the shared-card change. Test profile pagination and stale responses, and verify video projection against the existing generated shapes. Run the repository's applicable focused tests, types, lint including parity, Storybook build and interaction/accessibility checks, Worker/SSR/hydration and API-provenance gates. Record the exact tested source and honest skipped checks. A fixture screenshot is not live acceptance.

No app build, browser interaction sweep, device, wallet or chain check was performed to create this package. Image verification and file checksums establish export readability and package integrity only.

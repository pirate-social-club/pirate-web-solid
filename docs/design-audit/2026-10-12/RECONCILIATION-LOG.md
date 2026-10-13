# Storybook to Paper reconciliation log

This log records each slice from `AUDIT-BRIEF.md` that has been implemented. For each slice it gives the routine choices made under the recorded owner direction (reconcile the catalogs, resolve routine choices without another approval round), and what still differs from Paper. Missing contracts and Dance remain dependencies, not open questions.

## Slice 1a: shared post card (`e652d9b`)

**Paper sheet:** `Parts/Posts/PostCard`, states 013–015.

**Matched, measured at 390 px in `Screens/Community/PageShell/MixedKinds`:**

| Element | Measured value |
| --- | --- |
| Card | 350 px wide, 20 px block padding, 12 px gap |
| Author row | 24 px tall |
| Author label | 14/500/20 |
| Age | compact `2h`, 14 px muted, inside `<time>` |
| Overflow mark | 32 px, inside a 44 px touch target that does not grow the row |
| Song play button | 44 px primary |
| Song tile | 82 px, solid muted fill, `--radius-xl` |
| Video frame | 252 × 448, `--radius-xl`, 56 px play button at 45 % black, soundtrack line inset 12 px |

**Video posts**

The card binds only to the typed `video` projection:
- `projectVideoDelivery`;
- the 18+ policy;
- `song_reference.song_title`.

Playback goes through the existing access endpoint and poster route. The card never autoplays.

**Projector:** post types the card cannot draw are now left out instead of drawn as text.

**`RewardPill`:** a stateless `packages/solid-ui` primitive (`Patterns/Engagement/RewardPill`). No live feed renders it.

**Decisions**
- **Age format:** compact age on cards. Comments keep "5m ago".
- **Overflow:** a 32 px mark in a 44 px target.
- **Song artist:** absent until a projection exists.

## Slice 1b: single profile posts feed (`6ff62d1`)

**Paper sheet:** `Screens/Profiles/Profile`, states 205, 207 and 209.

**Feed**
- `ProfileActivity` reads `surface: "posts"` only.
- One newest-first feed in the shared card, with no tabs and no comment rows.
- The session, stale-response, cursor and refresh guards are unchanged and still tested.
- Old `#overview`, `#posts` and `#comments` links land on the feed.

**`ProfileLayout`**
- full-width cover, 144 px on phone and 200 px on desktop;
- one 640 px column with 20 px gutters;
- 80 px avatar beside the label;
- full-width bio;
- the viewer's action as a full-width 44 px outline button with `--radius-lg`;
- a divider above the feed.

**Label rule:** the label is the handle when there is one, otherwise the name. This is Paper's rule and the card's `publicProfileLabel` rule. It changes `/u/[handle]`, which showed the display name. `/p/[persona_id]` already used it.

**Boost**
- Boost moved from a separate "Song actions" button into the card's overflow menu ("Post options" → Boost). It opens the same `RewardSponsorDialog`.
- This matches the Paper feed's More menu, keeps the author row as drawn, and keeps Boost live on every song card.

**Feed dividers (fixes a live bug)**
- Engagement controllers wrap each card, so the card's `first:pt-0 last:border-b-0` treated every signed-in card as both first and last. That dropped dividers and top padding on the community page and the profile.
- Feed lists now decide first and last by position (`communityFeedListClass`).
- The single post page passes `flush`.

**Stories**
- `Compositions/Profiles/ProfilePage` is retitled `Screens/Profiles/Profile`, matching the sheet and the catalog tiers.
- Every story shows song, video and text posts.
- New `WithoutHandle` story.

## Review follow-up (`f7bd144`)

**Manual card playback**
- The card had passed `autoplay={false}`, which is the vertical feed's "hold paused" policy. Every status change, including a grant renewal, cleared the play intent and paused the video, so playback the viewer started stopped at the first renewal.
- `VideoPlayer` now has `activation="manual"`:
  - nothing starts playback automatically;
  - a renewal keeps whatever the viewer chose, playing or paused;
  - leaving the viewport ends the play intent.
- Tests cover silence → explicit play → successful renewal (this test fails against the old card setting), a viewer pause surviving renewal, and the viewport reset.

**Video delivery is required**
- `CommunityPost` is a discriminated union. A video post must carry its delivery state, and only a video post may.
- The projector returns an explicit variant per kind.
- A compile-time test pins both directions.

**Boost focus return**
- Boost opened the dialog from a menu item that no longer exists, so dismissing the dialog left focus nowhere.
- The card now returns focus to its Post options trigger.
- `SongBoostFromMenu` covers selection, opening, Escape and focus return in the browser.
- `AdultVideoAccess` covers the 18+ card.

## Slice 2: community page, home feed, post page

Each screen was audited against Paper by a read-only pass first, then implemented in an isolated worktree and integrated here. Every audit difference was classed as one of: fixable with existing data; needs API data; needs an owner decision; app shell; or an intentional recorded difference. Only the first class was implemented; the others are listed below.

### Community page (`c2190dc`, fix `337ee48`)

**Paper sheet:** `Screens/Community/CommunityPage`, states 178–186.

- **More for every viewer**, a 208 px menu on desktop and a bottom sheet on phone:
  - Share uses the Web Share API, falling back to the clipboard with a toast;
  - Unfollow;
  - Manage for managers.
- **The member's profile button moved into the banner**, beside More, replacing the floating corner control. Inside the app its naming menu button is desktop only, because a phone already has the footer's profile menu. Two controls with one accessible name had failed `community-name-locale-hydration-check` in CI (`337ee48`).
- **A follower who has not joined** sees only Join, full width.
- **Desktop tabs** are Feed and Songs, at their own width; About is the side card there.
- **Header and avatar:** no phone description; avatar 80/96 with no ring and 24/28 initials.
- **About card:** radius 24, no shadow; "Rules"; "Anyone can join."
- **Banner:** 40 px overlay buttons with no shadow; Paper's oklab gradient, with the scrim only over a photo.

### Home video feed (`cf412ed`, `ed8f374`, `3d6ffc7`)

**Paper sheets:** `Screens/Posts/Feed` (states 167–177) and `Patterns/Engagement/VerticalFeed`.

- **More is built into the design-system `MediaPost`:**
  - desktop: a 52 px circle inside the card, opening a 220 px menu;
  - phone: a 56 px button opening a bottom sheet;
  - it always holds Mute/Unmute;
  - **mute left the rail**, as Paper's VerticalFeed sheet requires.
  - **Signed-out phone:** the header's Sign in owns the top right, so More sits below the header instead. It is never hidden, because it holds the only Mute. Hiding it, as first shipped, let a tap unmute a signed-out viewer with no way to mute again (review fix, PR #60).
- **Desktop layout:** card and rail are one centred row, gap 20.
- **States:**
  - error: "Couldn't load the feed." with Try again;
  - empty: "Nothing here yet";
  - loading: a 32 px ring, drawn with CSS because the repository forbids hand-authored SVG (`3d6ffc7`).
- **Rail:** 14 px labels, no drop shadows, Paper's top scrim on phone.
- **Phone header:** no Post on the immersive home.
- **Report is built but off in production (`ed8f374`).** The flow is a reasons list, sent once with an idempotency key, through a helper now shared with `PostEngagement`. api-next resolves a post report through its text submission, so a report on a video post is answered "not found". `videoReportsSupported` defaults to false; stories and tests enable it.

### Post page (`5d440b5`)

**Paper sheet:** `Screens/Posts/Post`, states 210–213.

- **Comments are inline** under the post; feeds keep the side sheet.
- **Composer:** a 36 px avatar, a 44 px "Add a comment" input, and a 44 px send icon. It is fixed at the bottom on phone and sits under the post on desktop. Choosing a profile is done by tapping the avatar.
- **Reporting:** the composer's report-reason select is gone. Post and comment reports open a reasons list that sends on one tap.
- **Header:** the phone gets a 56 px header with back, community avatar and name, and no footer tabs. Desktop gets a 704 px column with a back-and-community row.
- **Text post:** uses the shared card, with a 20 px title.
- **Comment rows:** flat, with compact age. Replies get a 2 px left rule and no Reply button; Reply is a pill.
- **Signed-in non-members:** a full-width "Join to comment" bar. Signed-out viewers see "Sign in to comment" in the same bar.

### Cleanup (`1a67add`)

Runtime-only reachability from the production entries excluded type-only imports. Each candidate was then checked for string, worklet and script references. 34 files were deleted:

- the old feed cards (`public-feed.tsx`, `home-feed.tsx`) and the Boost button they carried;
- an unused send-winnings sheet;
- profile-edit and agent-page models;
- post-card helpers;
- two orphan composer components;
- a video-player model and an unused types file;
- four unused `lib` utilities;
- the Dance journey story: about 370 lines of story-local imitation UI for a blocked feature.

The two live adapter contract tests moved to `public-feed-adapter-contract.test.ts`. The story-parity gate now ignores type-only imports, which is how the dead feed cards hid from it; a test pins the import forms.

## Branch and admission record

This section gives the facts the coordinator needs to reconcile the authoritative workstation record. That record still says *planned* on `feat/paper-storybook-reconciliation`. This cloud session cannot reach the workstation `tasks/records/`.

**Where the work is**

| Item | Value |
| --- | --- |
| Repository | `pirate-social-club/pirate-web-solid` on GitHub |
| Branch | `ccr-1bb64139-1xpaas`, the branch assigned to this cloud session |
| Base | `main` at `45d07cb25b3267ad16f158aa40eff7d11ad49c5e` |
| Audit commit | `f77c687` |
| Slice 1a | `e652d9b` |
| Slice 1b | `6ff62d1` |
| Review follow-up | `f7bd144` |
| Evidence commit | the commit that adds `evidence/final/` |
| Slice 2 | `c2190dc`, `337ee48`, `cf412ed`, `ed8f374`, `5d440b5`, `1a67add`, `3d6ffc7` |
| Pull request | #60 (draft) |
| Reference branch | `handoff/paper-storybook-20261012` at `9c21981`, unchanged |
| API pin | `e8628c82d7d3827e69e13641538e2ba7c08bfd80`; api-next is unchanged |

**Deviation from the published direction**
- The implementation is stacked on the audit branch. It is not on a dedicated `feat/paper-storybook-reconciliation` branch. The proposed handoff record named `feat/paper-post-card-profile-reconciliation`.
- The reason: this cloud session may push only its assigned branch without explicit permission for another.
- No history has been rewritten. If the record needs the named branch, it can point at the same final commit, which preserves every SHA above.

**Admission**
- Implementation started on the workspace owner's direction, relayed in this session on 2026-10-12. The direction supersedes the 2026-10-11 Paper-only restriction, asks the cloud agent to reconcile the full Storybook catalogs starting with the card and profile slices, and resolves routine choices without another approval round. Missing contracts and Dance stay as dependencies.
- The coordinator said they would record that direction. This log is not that record.
- Nothing has been deployed, no pull request is open, and Rewards stay disabled.

## Recorded differences from Paper

| Difference | Why it remains |
| --- | --- |
| No community line under the profile label | No profile read projects the community's display name. It is not derived from handle grants. |
| Settings, not Edit; no Get handle | Edit and Get handle have no working destination yet. |
| No back or More buttons on the profile cover | More holds Share, which does not exist yet. Back belongs to the app shell. |
| No reward pill in live cards | No activity-count projection exists, and Rewards are disabled. |
| No song artist line | No feed projects an artist. |
| Four-tab footer; no Notifications | No notification contract exists. |
| Leave missing from the community More menu | The generated client has no leave or delete-membership operation. |
| Sort control beside More | Paper does not draw sorting. It is kept, left of More. |
| Join labels follow the membership mode | Paper's "always Join" is an unconfirmed ruling; the API still has request mode. |
| Unfollow hidden for members | Spec 016 §4.6: a member may not unfollow. Paper draws it for members. Owner decision pending. |
| Profile button shown to non-members with a usable profile | Paper shows no button to visitors. Owner decision pending. |
| No community streak line or Leaderboard | Owned by the rewards-activity-ui lane; it has no destination yet. |
| No Boost row in the feed's More | No boost-eligibility contract; Rewards are disabled. |
| No Report in the feed's More | api-next accepts post reports for text posts only. The flow is built and off (`videoReportsSupported`). |
| No Dance activity in the feed rail | No Dance capability or route. Dance is blocked by its prerequisites. |
| Feed's first More row reads "Unmute" | The feed starts muted so autoplay can run. Paper draws "Mute". |
| Signed-out phone More sits below the header | Paper's feed sheets draw a signed-in viewer. Signed out, the header's Sign in owns the top right, and More still has to hold the only Mute. |
| Signed-out viewers see no comments on the post page | `GET /posts/:postId/comments` requires a signed-in user. |
| No comment vote pill; oldest-first comments | No comment-vote endpoint; the server orders oldest first. |
| Replies need "View replies" on the post page | Loading them all would cost one request per comment. Owner decision pending. |
| Study, Karaoke and the Megapot summary stay on song posts | Removing them would leave no way into an activity while the reward pill is absent. |
| Video cards never appear live | Both api-next feed queries return only text and songs. Slice 1c widens them, and must not ship to an environment until this build is serving and verified there. |

## Verification

Run on Node 24.21.0 for each slice:
- `tsc`;
- `solid-ui` typecheck;
- lint with story parity;
- the full app suite (165 files) and SSR suite (15 files);
- test-discovery;
- the Worker build;
- `community-feed-hydration-check` and `song-feed-playback-check`;
- the Storybook axe and interaction sweep over the card, pill, engagement, post and profile stories (111 stories at 1b, all passing).

For 1a, the naming-locale hydration, text-post and song-post checks also passed.

At 1b, `song-feed-playback-check` timed out once on its spawned Storybook's first story. An immediate rerun passed. Four isolated reproductions passed. A later full `verify` run reproduced it consistently, and the cause is now established. A fresh Storybook takes 77–89 s to compile the story's first load in this container, against the check's 60 s budget. The baseline `45d07cb` fails identically, and is slower. See `evidence/final/EVIDENCE.md`.

**Final acceptance evidence for `f7bd144`** is in `evidence/final/`:
- both Storybook production builds;
- the full-catalog sweep against the production build: 760 stories, 0 axe violations, and 88 of 88 touched stories passing;
- the 9 pre-existing `VideoPost/Authoring` failures, shown identical at `45d07cb` and caused by the missing H.264 encoder;
- phone and desktop captures with Paper comparisons.

**Not verifiable here:** real Stream video playback, staging data, and devices.

**Slice 2 evidence for `3d6ffc7`** is in `evidence/slice-2/`:
- the app Storybook production build;
- the full-catalog sweep against that build: 780 stories, 0 axe violations, and 202 of 202 touched stories passing. Only the same 9 `VideoPost/Authoring` H.264 failures remain;
- 20 phone and desktop Paper comparison captures, covering community 178–186, feed 169–177 and post 210–213.

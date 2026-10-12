# Paper handoff audit and implementation brief

**Reference source:** `pirate-web-solid` `45d07cb25b3267ad16f158aa40eff7d11ad49c5e` (main; the audit checkout's HEAD).
**API reference:** `api-next` `e8628c82d7d3827e69e13641538e2ba7c08bfd80` (2026-10-12, #594), the brief's pinned revision. Server SQL was read at `4a791f27fb7c983689fe75150953be67ed25f709`, which descends from it. `git diff e8628c82 4a791f2` is empty for every API file cited here: `profile-activity-repository.ts`, `public-community-threads-repository.ts`, `contracts/src/profile-activity.ts` and `contracts/src/v1.ts`.
**Revision 2:** incorporates the reviewer's corrections on release gating and karaoke retention (§1.1, §1.8, §11.0).
**Design package:** `handoff/paper-storybook-20261012` at `9c21981`, `docs/design-handoff/2026-10-12/`. All 458 `SHA256SUMS` entries verified.
**Date:** 2026-10-12. **Status:** audit only, for review before implementation. No app or API source was changed, and the reference branch `handoff/paper-storybook-20261012` was left unchanged. This brief, `sheet-to-story-map.csv` and `evidence/` are published on a separate audit branch under `docs/design-audit/2026-10-12/`.

This brief stands alone. Paths are repository-relative. The handoff calls a design board a "sheet", and the brief uses that name. "Measured" means taken from a rendered Storybook story in headless Chromium at the stated viewport. "From source" means read from code, not rendered. "Not verified" is stated where it applies.

---

## 1. Findings that change the plan

1. **No video post can reach either first-slice feed without an api-next change.**
   - The profile activity query filters `p.post_type IN ('text','song')`: `api-next/packages/platform-cf/src/profile-activity-repository.ts:9`.
   - The public community threads query has the same filter: `api-next/packages/platform-cf/src/public-community-threads-repository.ts:262`.
   - The web contract for the community feed is closed to `surface: "threads"` and `sort: "new"`.
   - The video card can be built and storied against the existing typed shape. Live profiles and community feeds will still show no videos until the server filters change.
   - The proposed task record excludes API changes, so this dependency must go to an api-next owner. It is not something to work around.
   - **Release gate (corrected):** merge order does not prevent the mismatch. The API must not start returning video items in an environment until the frontend that renders them is **serving and verified there** (staging first, then production). Until then the current projector's fallback would show each video as a text card (§3.3).

2. **The wire type for video already exists; nothing needs inventing.**
   - Feed items and profile-activity `content` both carry a typed `video` object in `@pirate/api-client@0.114.0`: `playback {ready|pending|unavailable}`, `thumbnail`, `soundtrack`, `caption`.
   - The app already has a typed projector, `projectVideoDelivery` (`src/features/posts/video-submission/delivery-state.ts`).
   - It also has a player, `VideoPlayer` (`src/features/posts/video-submission/video-player.tsx`), that mints signed playback through `post_postsPostIdVideoPlaybackAccess`. That player is built on `mintPlaybackAccess`, `videoPosterPath` (`playback-access.ts`) and the `/api/posts/{id}/video/poster` route.
   - The card should bind to those and nothing else. Feed references are not URLs; the code says so explicitly.

3. **The single profile posts feed needs no new contract.**
   - `get_publicPersonasPersonaIdActivity` already accepts `surface: "posts"`.
   - The server orders `activity.at DESC, activity_id DESC` with 20 per page (`LIMIT 21` probe): `profile-activity-repository.ts:51`.
   - The work is client-side: drop the tabs and fix `surface` to `"posts"`. Keep the existing cursor, abort, generation and session-refresh guards.

4. **`CommunityPostCard` is one shared component reaching three live surfaces:**
   - the community page (`community-page.tsx:886` via `page-shell.tsx:345`);
   - profile activity (`profile-activity.tsx:31`);
   - the public post route (`public-post-route-view.tsx:141`).

   Any edit to it changes all three immediately.

5. **There is a second, divergent post card, `FeedItemCard`** (`src/features/posts/feed/public-feed.tsx:142`).
   - It already renders video through `VideoPlayer`, and has its own Boost button.
   - No route renders it. `src/routes/index.tsx` only *type*-imports `public-feed.tsx` and `home-feed.tsx`.
   - It is a consolidation candidate. It also exposes a gap in the parity gate (§7).

6. **The profile header's "community" subtitle and handle-less label have no source.**
   - The design's line under the name ("Harbor Collective") is not in `GetPublicPersonasPersonaIdResponse`. That response has `persona`, `profile {cover_ref, bio}` and `handle_grants[].community_id`, but no community display name.
   - "User 4KQ7M2" (design 206) and the **Get handle** action have no counterpart; the code has only a fallback label (`publicProfileLabel`).

7. **Rewards are disabled on the server only.**
   - Production `MEGAPOT_REWARDS_ENABLED="false"`: `api-next/wrangler.jsonc:14`.
   - The web app has no flag or capability check. The Boost entry point, `RewardSponsorAction`, is shown on every community song (`page-shell.tsx:159`).
   - No reward count exists in any feed contract. The pill must stay a fixture.

8. **Karaoke retention: no contradiction found; two separate questions remain (corrected).**
   - The serializer's `retention: "not_stored"` (`src/features/karaoke/runtime/serialization.ts:170`) is **provider** retention: `karaoke-api.ts:228` maps `policy.provider_retention` into it.
   - The API declares **platform** retention separately (`platform_retention: "private_learning"` in the generated client).
   - So the serializer restriction does not contradict the disclosure that "Pirate also stores your recording privately for 24 months" (`karaoke-route-view.tsx:384`).
   - Trace two things separately, outside this lane:
     1. **Provider-policy compatibility:** the client rejects any `provider_retention` other than `not_stored`, while the disclosure says the provider "may retain" under its standard terms.
     2. **Actual platform storage and deletion:** whether the 24-month store and Settings deletion behave as disclosed.
   - Keep the approved disclosure unchanged meanwhile.

---

## 2. Method and evidence base

**Measured** (Storybook 10.6.0 dev server, headless Chromium 1194, dark scheme):
- `Compositions/Profiles/ProfilePage` (live-own-profile, live-own-profile-mobile, live-visitor-mobile, activity-tabs)
- `Screens/Community/PageShell` (community-with-posts)
- `Parts/Posts/Shared engagement` (interactive-post)
- Viewports: 390 px (phone) and 1280 px (desktop), matching the export widths.
- Computed styles were read from the DOM and compared with the sheet's JSX export values in `reference/jsx/Parts-Posts-PostCard.jsx.txt`.
- `reference/first-slice-computed-styles.json` contains only frame-level styles (card padding/gap/border and the 390/1280 frames), so inner card values come from the JSX export.

**Contract shapes** were enumerated with the TypeScript checker against the installed generated client, not by grepping the single-line type blobs.

**Server behaviour** comes from reading the api-next repository SQL. No API was called.

**Later slices** (§9) were checked from source by a separate read-only pass, and I spot-checked the riskiest claim (karaoke retention).

**Side-by-side images** are in `evidence/`, beside this file:
- `profile-mobile-own.png`
- `profile-desktop-own.png`
- `postcard-text-song.png`
- `profile-headers-206-207.png`

**Not done:** no device, wallet, chain, staging or production checks; no Worker/SSR/hydration scripts beyond the two profile SSR tests; no pixel diffing. A matching Storybook title (§6) is a name match, not rendered parity. Only the first slice was compared visually.

---

## 3. First slice: the post card

### 3.1 What exists

| Design element | Current implementation |
| --- | --- |
| One card for every listing | `CommunityPostCard`, `src/features/community/page-shell/page-shell.tsx:142`. Kinds: `"text" \| "song"` only (`page-shell-model.ts:3`). |
| Kind mapping | `projectCommunityThreadPost` (`src/features/communities/community-page/community-thread-feed-api.ts:35`) maps `post_type === "song"` to song and **everything else to text**. `supportsPostReports` is true only for text. |
| Author row | Avatar, label, `· {relativeTime}`, `ContentOverflowMenu`; for songs also `RewardSponsorAction` (Boost). |
| Song body | `SongPost`: art tile, title, optional artist, compact `SongPlayer`. `mediaSrc` (art) is never projected from the feed, so the art is always the placeholder icon. |
| Engagement row | `EngagementControls` → `VotePill` + `CommentPill` from `packages/solid-ui`; on live routes always with `onVote` (anonymous viewers get a sign-in prompt). |
| Video body | **None in this card.** The unreachable `FeedItemCard` renders `VideoPlayer`. |
| Reward pill | **None.** `IconGift` already exists in `packages/solid-ui` (`components/media/icons.tsx:591`). |

### 3.2 Measured differences (phone, 390 px)

| Property | Design (JSX export) | Current (measured) | Note |
| --- | --- | --- | --- |
| Card padding / gap / divider | 20 px block, 12 px gap, soft bottom border | 20 px (0 top on the first card), 12 px, soft border | Matches |
| Author row gap / avatar | 8 px / 24 px | 8 px / 24 px | Matches |
| Author label | 14 px / 500 / 20 px | **16 px** / 500 / 20 px | `Type variant="label"` |
| Age | `2h`, 14 px muted, no separator | **`· 7d ago`** | Copy and format differ (`relativeTime`) |
| Overflow trigger | 32 × 32, `margin-left: auto` | **44 × 44** | Row grows from 24 px to **44 px**. 44 px meets touch-target guidance, so this is a decision, not a defect (§10). |
| Title | 20 / 600 / 28 | 20 / 600 / 28 | Matches |
| Body | 16 / 24 | 16 / 24 | Matches |
| Song tile | 12 px padding, 12 px gap, `--radius-xl`, `--color-muted` fill, soft border; art 56 px `--radius-lg` | From source: `p-3 gap-3 rounded-xl border-border-soft bg-muted/30`; art `size-14 rounded-lg` | Fill is muted at **30 %** rather than solid |
| Song play button | **44 px, filled `--color-primary`** | **36 px, `oklch(0.3 0 0)`** (secondary) | Visible difference |
| Song artist line | "The Tidewater" | Shown only if `mediaArtist` is set; **the feed projects no artist** | Missing projection. A fixture artist is not live data. |
| Vote pill | 44 px, 4 px inline padding, ↑ n ↓ | 44 px (122 × 44), 4 px | Matches |
| Comment pill | 44 px, 16 px padding, 8 px gap | 40 × 40 icon element inside a 44 px pill (from the DOM) | Close; not pixel-diffed |
| Action row | 8 px gap, 4 px top padding | 8 px, 4 px | Matches |
| Reward pill | Third pill on song **and video** posts | Absent | Fixture-only (§3.4) |
| Boost | Not in the author row (the pill replaces it) | `RewardSponsorAction` in the author row on songs | Relocation is gated (§3.4) |
| Video poster | 252 × 448, `--radius-xl`, centred 56 px `#00000073` play button, caption at 12 px inset, 14 px `#FFFFFFD9` | Absent | New |

**Story drift:**
- `Screens/Community/PageShell` stories pass no `renderPost`, so they render the count-only fallback: 36 px pills with ↑ and score only.
- No live route renders that state; every host passes `onVote`. The PageShell stories therefore under-represent the live card.
- Card review should use the actual-component stories that wrap `PublicPostEngagement`, as `Compositions/Profiles/ProfilePage` does.

### 3.3 Video projection: what can be bound

Typed fields on `GetPublicCommunitiesCommunityRefFeedResponse["items"][n].video`, also present on profile-activity `content.video`:

```
track: "video"; caption; caption_dir; caption_lang
soundtrack: { kind:"original_audio", original_sound_id, origin_video_post_id, origin_author_persona_id }
          | { kind:"song_reference", song_reference:{ song_post_id, song_title, song_author_persona_id }, render_mode }
playback:  { status:"ready", provider:"stream", playback_ref } | { status:"pending" } | { status:"unavailable" }
thumbnail: { status:"ready", artifact_ref } | { status:"pending" } | { status:"unavailable" }
data_registration; capabilities.can_post_with_song
```

Bind:
- `projectVideoDelivery(item.video)` → `VideoPlayer { postId, state, requiresAgeVerification: post.age_gate_policy === "18_plus" }`
- Poster through `videoPosterPath(postId)`, only when `thumbnail === "ready"`.
- The design's caption line ("Harbor Lights - The Tidewater") is the song reference.
  - `song_reference.song_title` is typed.
  - **No artist field exists.** Render the title alone, or record the artist as a missing projection.

Do not use `media_refs`, `asset` or `playback_ref` as URLs. `resolveVideoMedia`'s legacy URL sniffing is explicitly fail-closed and is not the contract.

**Ordering hazard (verified by reviewer):**
- If an environment's API returns video items before that environment *serves* a web build whose projection knows `video`, the current projection renders each video as a **text card titled "video"** (`title ?? caption ?? post_type`).
- Merging in the right order is not enough; the gate is deployment and verification (§1.1, §11.0).
- The new projection should map unknown post types to `null` (skip them) instead of to text, so any future type degrades to absence rather than a wrong card.

**Reporting:** `supportsPostReports` stays text-only. Do not widen it because the kinds now share a card. The brief says the same.

### 3.4 Reward pill and Boost

- Build the pill as a stateless `packages/solid-ui` primitive, for example `patterns/engagement/reward-pill/`. It takes explicit `count` and `onOpen` props and has stories, matching VotePill and CommentPill: 44 px, full radius, soft border, 16 px inline padding, 8 px gap, gold `IconGift`.
- The sheet leaves loading and unavailable states undrawn ("to design when the pill is built"). Do not invent them; record them as missing.
- **Do not place it in live cards.** No feed contract carries an activity count. `karaoke_capability` and `streak_summary` are untyped `Record<string, unknown>`, and Rewards are off in production.
- **Keep Boost where it is** until the pill has a live destination. Moving Boost would remove the last working sponsor entry point. `FeedItemCard`'s Boost is not reachable, so `page-shell.tsx:159` is the only live one (covered by `page-shell-actions.test.tsx:97`).

---

## 4. First slice: the profile

### 4.1 What exists

| Route | Component chain |
| --- | --- |
| `/p/[persona_id]` | `src/routes/p/[persona_id].tsx` → `PersonaPublicProfile` → `ProfileLayout` + `ProfileActivity` |
| `/u/[handle]` | `src/routes/u/[handle].tsx` → `PublicProfilePage` → `ProfileLayout` (+ activity) |
| Stories | `Compositions/Profiles/ProfilePage` (9), `Screens/Profiles/PersonaPublicProfile` (8), `Screens/Profiles/PublicProfilePage` (7) |

### 4.2 Measured differences

| Property | Design | Current (measured) |
| --- | --- | --- |
| Phone gutters | 20 px (350 px card in a 390 px frame) | **12 px** (366 px card; `ProfileLayout` `px-3`) |
| Desktop column | **640 px** column; cover full-width under the app sidebar | `max-w-[65.5rem]` (1048 px), card measured at **1000 px**; cover inside a rounded card |
| Header layout | Avatar (≈80 px) left of label and community subtitle; cover with back and More buttons | Avatar overlapping the cover; display name, then `@handle`; no back or More on the cover |
| Primary label | Handle (`harbor.8s28`) | Display name ("Owned profile"), with `@handle` below |
| Own action | **Edit**, outline, full width; plus **Get handle** (primary) when there is no handle | **Settings**, primary, a link to `/settings` (`own-profile-settings.tsx:22`) |
| Activity | **One posts feed, no tabs**, newest first; song, video and text; no comments | **Three tabs** (Overview, Posts, Comments; icon-only on phone); Overview mixes comments |
| Footer / sidebar | Five destinations including Notifications | Four (`MobileFooterNav` `grid-cols-4`); the design calls this an intentional reference difference |
| Fixture coverage | Song, video and text posts | Story fixture has one **text** post titled "Harbor Lights" and one comment; no song or video item |

### 4.3 Feed contract and protections to keep

- **Contract:** `surface: "posts"`, cursor-paged, server-ordered newest first, 20 per page, comment rows excluded server-side.
- **Server visibility:**
  - published posts only;
  - active community;
  - `can_account_view_content_rating_v1`;
  - public, or members-only for members.
  - Videos are excluded by the filter in §1.1.
- **Client protections, already tested** (`profile-activity.test.tsx`):
  - session resolved before the read;
  - a stale response from a previous profile discarded;
  - an empty page with a cursor continued; a repeated cursor stopped (`non_advancing_activity_cursor`);
  - session refresh clears previous member activity.
  - SSR tests: cached HTML defers viewer-authorized reads; static persona hosts omit activity.
- **What changes:**
  - Remove `tabFromHash`, the tabs and the `hashchange` listener.
  - Fix `surface` to `"posts"`.
  - Keep the existing generation, abort and `onSessionRefreshed` structure.
  - Old `#comments` and `#overview` links should land on the feed without error.
  - Update the first test, which reads the selected tab.

### 4.4 Missing contracts and decisions (profile)

- **Community subtitle:** no field. Options: omit it, or request a public projection of the persona's community display name. Do not derive it from `handle_grants`, which a handle-less profile does not have.
- **Handle-less label and Get handle:** the label fallback exists (`publicProfileLabel`). The **Get handle** destination and eligibility are not in this lane, so leave the action out.
- **Edit:** out of scope by the brief. Keep **Settings** until Edit ships, and record it as a reference difference.
- **Undrawn states:** loading, empty, gone and several handles, per `authority/paper-final-handoff.md`. Keep the current behaviour and copy; do not invent new screens.

---

## 5. Missing states, first slice

| State | Drawn? | Story today? | Live? |
| --- | --- | --- | --- |
| Video card: ready, poster ready | Yes (015) | No (card); `Screens/Posts/VideoDelivery` covers the player alone | No (server filter) |
| Video card: pending, unavailable, no thumbnail | No | Player only (`VideoDelivery`) | No |
| Video card: 18+ gated | No | `HomeVideoFeed` adult stories cover the feed, not the card | No |
| Song card with artist | Yes | No artist projection | No |
| Song card with art | Yes | `mediaSrc` never projected | No |
| Reward pill: loading, unavailable | Not drawn (explicitly) | No | No |
| Profile, posts-only feed | Yes (205–209) | No (tabs) | No |
| Profile: empty, loading, error, gone | Not drawn | Generic copy exists | Yes |
| Long text, narrow layout | Not drawn separately | `page-shell-actions.test.tsx:181` covers long names only | Yes |

---

## 6. Sheet-to-story map (all 95 sheets)

The full table, with story files and notes, is `sheet-to-story-map.csv`. Summary:

| Match | Count | Meaning |
| --- | --- | --- |
| exact | 65 | A Storybook title equals the sheet name. **Name only; rendered parity not checked** outside the first slice. |
| renamed | 5 | Same subject under another title: `Flows/Posts/Video` → `Flows/Posts/VideoPost/*`; `Flows/Community/JoinAndName` → `Flows/Community/Join and name` (+ Connected); `Flows/Rewards/Boost` → `Functional boost` / `Create a bounty`; `Screens/Posts/Feed` → `HomeVideoFeed`; `Screens/Posts/Post` → `PublicPostRoute` |
| partial | 15 | Nearest components cover part of the sheet (PostCard, Profile, Address, Song/Text flows, Wallet Send/Claim, YourProfiles, PayStep, ActivityResult, Streak, ReviewRows, SongRow, StatusState, Management) |
| docs | 5 | Foundations sheets exist as MDX docs pages |
| fixture-only | 1 | `Flows/Dance/Take` → `Flows/CreateEntry/DanceJourney`, a story-only fixture with no route |
| none | 4 | `Parts/Rewards/RewardPill`, `Parts/Rewards/SongEarnSheet`, `Parts/Verification/VerifySheet`, `Screens/Shell/Notifications` |

Catalog notes:
- `Compositions/Profiles/ProfilePage` uses a tier that is not one of the seven in `docs/storybook-catalog-hierarchy.md` (Flows, Screens, Parts, Foundations, Components, Patterns, Internal). The first slice should retitle it to `Screens/Profiles/Profile`, matching the sheet.
- The app catalog has **62** story files and the design system **68**. The parity gate reports "ok (62 app stories checked)" at `45d07cb`.

---

## 7. How Storybook relates to the app

- **Editing a shared component changes production immediately.**
  - `CommunityPostCard`, `ProfileActivity` and `ProfileLayout` are route-reachable.
  - Editing them, and their stories in the same commit, changes the community page, both profile routes and the public post page.
  - There is no Storybook-only copy to promote later.
- **New design-system primitives** (the reward pill) live in `packages/solid-ui` with package stories. `scripts/check-story-production-parity.mjs` does not police that catalog, by design.
- **New app components satisfy parity only by being imported from a production entry or route** before their story lands, in the same commit.
  - `ALLOWED_STORIES` is empty and should stay empty.
  - The story-infra exemption covers files named `*fixtures*`, `fake-*`, `story-helpers` and `story-fixtures` only.
- **Limit of the gate:**
  - It matches `import type` the same as runtime imports (`importPattern`, line 22), so a type-only import from a route makes a file "reachable".
  - Example: `public-feed.tsx` is type-imported by `src/routes/index.tsx:24` but rendered by no route.
  - No story imports it today, so nothing passes falsely now.
  - A story for `FeedItemCard` would pass the gate without being live. Reviewers should not treat a green gate as render reachability.
  - Tightening the gate is a separate change.

---

## 8. Contract facts behind the above

- **Generated client:**
  - The web app pins `@pirate/api-client@0.114.0-a2eb47a5`; provenance check passes.
  - api-next's own package is at `0.117.0`. Any first-slice API change implies a client bump through the existing provenance process.
- **Community feed query:** `surface: "threads"`, `sort: "new"`, `cursor`, `locale` only. There is no `videos` surface.
- **Profile activity query:** `surface: "overview"|"posts"|"comments"`, `cursor`, `locale`.
- **Unchanged files:** `git diff e8628c82..4a791f2` shows no changes to `profile-activity.ts`, `profile-activity-repository.ts` or the contracts file. Only two commits separate them.

---

## 9. Later slices: verified state

These come from a read-only source pass; I spot-checked item 4.

| Slice | Finding | Evidence |
| --- | --- | --- |
| Study answers | **Mostly matches already.** Correct choice advances after 700 ms; correct spoken answer advances immediately; incorrect pauses for Continue in both. There is no page-to-page Continue between result pages today. | `src/features/studying/studying-route-view.tsx:62-65,186-192,222-237,331-362` |
| Completion sequence | **Gap confirmed.** `CompleteState` shows the streak page *instead of* the result when `qualifiedToday`, a per-day boolean (`progress.qualified_today`), which does not identify the attempt that newly earned the day. | `studying-surface.tsx:387-438`; `studying-model.ts:76,335` |
| Streaks | **No week marks, no newly-earned signal** in 0.114 or 0.117. The live Study adapter maps no streak fields, so the streak page is unreachable on the live path. `streakWeek` is declared but never populated. | `study-v2-runtime-client.ts:48-99`; `studying-model.ts:82` |
| Karaoke disclosure | Gate exists and covers all three capture paths (`karaoke:microphone-disclosure:v1`), with a test. Possible retention-copy conflict (§1.8). | `karaoke-route-view.tsx:158,188-195,371-400`; test `:296-323` |
| Comments | List takes `parent_comment_id` and `cursor` only; server orders **oldest first**; nesting up to 8; **no comment-vote endpoint** (a `comment_votes` table exists, nothing serves it); UI says "Replying at depth N", not "Replying to @author". | `api-next/.../comment-thread-repository.ts:88`; `post-engagement.tsx:760-763` |
| Notifications | **Nothing exists.** No contract in 0.114 or 0.117; footer has four positions. | `mobile-footer-nav.tsx:52-84` |
| Send and Claim | Claim is palm-gated via `/verify/very?purpose=reward_claim` (a URL string, not a typed purpose) and resumes on return. The UI collapses `recipient_pending`, `failed_retrying` and other pending states into "Claimed", has no separate Paid or unknown state, and the API has five `payout_status` values. **Send has no verification gate.** | `winnings-model.ts:21-79`; `wallet-route.tsx:18-27`; `wallet-sponsored-send-sheet.tsx` |
| Rewards | Server flag only; production off. No web capability check. | `api-next/wrangler.jsonc:14,22`; `composition.ts:1636-1640` |
| Dance | Web: story-only fixture, no route, no API use. api-next: contracts and handlers exist, production authorities default to null. **Blocked** by amendment items A–F, ratification and a second independent review. | `dance-create-journey.stories.tsx`; `dance-*-production-composition.ts` |

**Existing state-machine idiom:**
- xstate v5 is used only in post submission: `text-submission-machine.ts`, `song-observation-machine.ts`, `video-composer-machine.ts`, with the Solid adapter `solid-actor.ts`.
- Study, Karaoke, Wallet and Rewards use signals and hand-written reducers.

---

## 10. Unresolved decisions (for the owner or coordinator)

1. **API dependency for video.** Who widens the two server filters (and checks video visibility and delivery state in them), and does it land with or after the web projection? The proposed record excludes API changes.
2. **Overflow trigger size.** Should it be 32 px as drawn, or stay at 44 px for touch targets? This changes the author-row height on every card.
3. **Age format.** `2h` as drawn, or the current `· 7d ago`? Localised copy lives in `relativeTime`.
4. **Profile header data.** Omit the community subtitle, or request a projection? Is the primary label the handle (design) or the display name (current)?
5. **Get handle.** Its destination and eligibility are unspecified.
6. **Song artist.** Omit it until a projection exists, or request one?
7. **`FeedItemCard` and `HomeFeed`.** They are unreachable. Delete them, or adopt the shared card (consolidation follow-up)?
8. **Karaoke retention follow-ups (not a contradiction; see §1.8).** Provider-policy compatibility and actual platform storage and deletion are separate traces; the approved disclosure stays meanwhile.
9. **Final-handoff conflicts carried forward.** "Moderated Dance is part of launch" versus the Dance prerequisites; daily participation versus one active session for seven days; submission-day versus pass-day lottery entry. None is settled by design.

---

## 11. Recommended implementation slices

Each slice is one branch, a separate implementation task, and owner release from the Paper-only restriction first. Order: **1a → 1b → 1c**, with 1c's release gated on 1a serving and verified (§11.0).

### 11.0 Boundaries that apply to every first-slice change

- **Shared-card review:** review the shared card on **all three live pages**: the community page, the profile routes (`/p/[persona_id]` and `/u/[handle]`) and the public post route.
- **Rewards:** **keep Boost live** in the author row. The reward pill stays **fixture-only** (design-system stories only) until a real capability or count projection and an authorized reward surface exist.
- **Profile scope:** the feed plus supported layout changes only.
  - Do **not** invent the community subtitle.
  - Do **not** rename Settings to Edit until a working Edit destination exists.
  - Leave Get handle out.
- **The other 65 sheets** are mapped **by name only, not visually audited.** Do not cite this brief as parity evidence for them.
- **Acceptance checks run on Node 24 or newer**, not the Node 22 this audit used. They include:
  - the Worker build (`bun run build`);
  - the hydration checks (`community-feed-hydration-check` and related scripts);
  - **real video playback** on the shared card;
  - plus types, lint with parity, focused and SSR tests, Storybook build and the scoped a11y and interaction sweep.
- **API release gate:** the API change that returns videos (1c) is released to an environment only **after** the 1a frontend is serving there and video rendering has been verified there.

### Slice 1a: shared card, video kind and pill primitive (web only)

**Card model and projection**
- Add `"video"` to `CommunityPostKind`.
- Add a `video?: VideoDeliveryState` plus `songTitle?: string` field to `CommunityPost`.
- In `projectCommunityThreadPost`, map `post_type`:
  - `video` → video, via `projectVideoDelivery(item.video)`;
  - `song` → song;
  - `text` → text;
  - **any other type → `null`**, instead of text.

**Card rendering**
- In `CommunityPostCard`, render `VideoPlayer` for the video kind: poster, 9:16 at 252 × 448, `--radius-xl`, caption from `song_reference.song_title`.
- Pass `requiresAgeVerification` from `age_gate_policy`.
- Keep one author row and one engagement row.
- Keep `supportsPostReports` text-only.
- Close the measured gaps that need no decision: song play button 44 px primary; tile fill.
- Leave the overflow size and age format for decisions 2 and 3.

**Reward pill**
- Add `RewardPill` to `packages/solid-ui` with stories (default, in place beside the vote and comment pills, and absent on text).
- **Do not render it in the app card.**
- Keep Boost.

**Stories, same commit**
- In `page-shell.stories.tsx`, add video ready, pending, unavailable and 18+ cases, plus a mixed feed.
- Wrap stories in real `PublicPostEngagement` so pills match live routes.
- Add a story that shows a fixture pill only in `packages/solid-ui`.

**Tests**
- Projection: the `video` mapping, an unknown type skipped, no URL taken from `media_refs`.
- Card: the video kind renders a player and no title link regression.
- Existing `page-shell-actions` tests stay green, including Boost on songs.

### Slice 1b: single profile posts feed (web only)

- **`ProfileActivity`:** remove the tabs, use `surface: "posts"`, and keep every guard listed in §4.3.
- **Empty state:** "No posts to show."
- **`ProfileLayout`:**
  - phone gutters 20 px;
  - desktop single 640 px column under a full-width cover;
  - avatar beside the label.
  - Keep **Settings** as is: no rename to Edit without a working Edit destination; no community subtitle; Get handle left out.
- **Stories:** retitle `Compositions/Profiles/ProfilePage` to `Screens/Profiles/Profile`. Add fixtures with song, video and text posts, and own (with and without a handle) and visitor states, at 390 and 1280 px.
- **Footer:** stays at four destinations; record the fifth tab as an intentional reference difference.
- **Tests:** update the tab test, then add:
  - "requests `surface=posts` only";
  - "a legacy `#comments` hash still renders the feed";
  - a mixed-kind page.
- **Also in this lane:** the SSR tests and the `community-feed-hydration-check` / `song-feed-playback-check` scripts.

### Slice 1c: api-next dependency (owning API task, not this lane)

- Widen both filters to include `'video'`. Decide whether only `playback.status = ready` items are listed, or pending ones are listed with a pending card.
- Add contract tests for video in the threads and profile-activity responses.
- Bump the client through provenance.
- **Release gate:** do not enable or deploy it in an environment until 1a is serving there and video cards have been verified there with real playback. Merge order alone is insufficient (§3.3).

### Later slices, in dependency order

| Slice | Prerequisite before code | Machine needed? |
| --- | --- | --- |
| Completion sequence (Result → Streak → Rewards) | Attempt-scoped "newly earned" in the study session contract; streak week marks | **Yes.** Result, loading-lottery (Continue held), check-failed (Try again), streak (optional), rewards (optional), last page; exit and resume |
| Streak and leaderboards (`rewards-activity-ui`) | Week marks and newly-earned in the contract; wire the live adapter | No; presentation over a read |
| Comments: one-level replies, newest-first top level | Server sort parameter and depth contract; flatten history with "Replying to" | No |
| Comment voting | Endpoint (none exists) | No |
| Notifications and fifth tab | Stored or read notification contract, unread, destinations | No (list), but routes into results |
| Wallet Send palm gate | Server enforcement and a typed verification purpose and return | **Yes.** Details, review, verify-required, verifying, return, sending, sent, failed, unknown; idempotency key preserved across retry |
| Claim recovery and outcome states | Distinct Claimed, Paid, pending and unknown from `payout_status` | **Yes.** Resume intended claim once after verification; no re-submit to re-read status |
| Reward results | Rewards enablement plus entry-status read semantics; status timeout is not "no reward" | **Yes** (part of the completion machine) |
| Dance | Amendment A–F, ratification, second independent review | **Yes,** after the prerequisites: take, submit, in review, withdraw (confirmed, failed, unknown), verdict or expiry race |

**Machine idiom:** follow `video-composer-machine.ts` and `solid-actor.ts` (xstate v5 with the Solid adapter) where a real multi-state flow exists. Test transitions, not snapshots: pending, confirmed, failed, unknown, timeout, retry, exit and resume. Do not rewrite existing Study or Wallet reducers by default.

---

## 12. Verification evidence (baseline at `45d07cb`, all unmodified)

| Check | Command | Result |
| --- | --- | --- |
| Handoff integrity | `sha256sum -c SHA256SUMS` (extracted with `git archive`) | 458/458 OK; branch adds 459 files only under `docs/design-handoff/2026-10-12/` |
| Install | `bun install` | 579 packages; `bun.lock` unchanged |
| Focused app tests | `vitest run --config vitest.app.config.ts src/features/profiles/profile-page src/features/community/page-shell src/features/communities/community-page/community-thread-feed` | 3 files, 28 tests passed |
| Profile SSR tests | `vitest run --config vitest.ssr.config.ts src/features/profiles/profile-page` | 2 passed |
| Types | `tsc --noEmit -p tsconfig.json` | exit 0 |
| Lint | `oxlint src` | exit 0 (888 warnings, 0 errors) |
| Story parity | `node scripts/check-story-production-parity.mjs` | ok (62 app stories) |
| API client provenance | `node scripts/check-api-client-provenance.mjs` | exit 0 |
| A11y and interaction sweep | `storybook-a11y-sweep.mjs --filter "profilepage\|pageshell--community-with-posts\|pageshell--feed-post\|shared-engagement\|personapublicprofile\|publicprofilepage\|votepill\|commentpill"` | 7 files / 40 stories: axe 40 pass, 0 violations; interactions 40 pass |
| Storybook build | `storybook build -o <scratchpad>` | Completed successfully, exit 0 (output outside the repository) |
| Storybook dev | `bun run storybook` | 819 index entries; stories render without page errors (one 404 console resource on the PageShell desktop story, not investigated) |

### Environment notes

- The container has Node 22.22; `package.json` asks for Node ≥ 24. Everything above ran on Node 22.
- The project's Playwright expects browser build 1243; the image ships 1194. The a11y sweep ran by pointing `PLAYWRIGHT_BROWSERS_PATH` at a scratchpad directory of symlinks to `/opt/pw-browsers`. Nothing in the repository was changed.

### Not verified

- Worker build and the Worker/hydration scripts (`community-feed-hydration-check`, `song-feed-playback-check`, `text-post-check`).
- The full test suites.
- Interaction coverage outside the 40 swept stories.
- Real video playback.
- Staging data.
- Any API call.
- The Handshake/Spaces Address sheet, state by state.
- Rendered parity for any sheet outside the first slice.

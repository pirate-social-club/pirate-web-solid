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

## Slice 1b: single profile posts feed (this commit)

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

## Recorded differences from Paper

| Difference | Why it remains |
| --- | --- |
| No community line under the profile label | No profile read projects the community's display name. It is not derived from handle grants. |
| Settings, not Edit; no Get handle | Edit and Get handle have no working destination yet. |
| No back or More buttons on the profile cover | More holds Share, which does not exist yet. Back belongs to the app shell. |
| No reward pill in live cards | No activity-count projection exists, and Rewards are disabled. |
| No song artist line | No feed projects an artist. |
| Four-tab footer; no Notifications | No notification contract exists. |
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

At 1b, `song-feed-playback-check` timed out once on its spawned Storybook's cold start straight after a production build. It passed at both widths on an immediate rerun.

**Not verifiable here:** real Stream video playback, staging data, and devices.

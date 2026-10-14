# Storybook viewport report: requested size against actual preview size

This report is report-only. No story, script or open PR was changed. It answers one question:

> When CI runs a story's play function, is the preview frame the size that story asks for?

## Source and method

**Source**
- Commit: `main` at `32c35aa7` (after #66, #67, #68 and #74).
- Catalog: the unified catalog, built with `bun run build-storybook`, the command CI runs. It was served statically from `storybook-static/`.

**Navigation**
- This is the same as `scripts/storybook-a11y-sweep.mjs`.
- One Chromium page at Playwright's default 1280×720.
- One `page.goto` per story, to the manager URL `/?path=/story/<id>&addonPanel=storybook/a11y/panel`.

**Probe (`probe.mjs`)**
- An init script wraps the preview channel's `emit`.
- It records the preview frame's `innerWidth` and `innerHeight` at every `storyRenderPhaseChanged` event: preparing, loading, rendering, playing, played or playErrored, completing, completed.
- It is passive: it does not change any story, global or timing.

**Requested viewport**
- It is read from the preview's own story store (`loadStory`): `storyGlobals.viewport` and `parameters.viewport`.
- It is resolved against Storybook 10.6's `MINIMAL_VIEWPORTS`, merged with a story's own `parameters.viewport.options`. For example, the media-shell stories define `mobile1` as 390×844.
- Each story is compared with its own configured preset, not a universal phone width.

**Control (`control.mjs`)**
- Every story that requests a preset and has a play function was also loaded directly in its preview frame (`iframe.html`), in a page already at the requested size.
- Its play function therefore runs at that size from the first frame.
- This tells phone assertions that genuinely hold at phone size apart from ones that only pass because they ran at desktop width.

**Repeats (`repeat-runs.jsonl`)**
- Seven example stories were probed three more times under manager navigation, to separate stable behaviour from timing noise.

**Ledger**
- `viewport-ledger.jsonl` has one record per story (742).
- Fields:
  - source commit and story ID;
  - requested preset and its resolved dimensions;
  - frame size at `playing` and at the end of play;
  - settled size;
  - for preset stories with a play function, the outcome under CI navigation and under the control.

## Coverage

| Requested | Stories | With a play function |
| --- | --- | --- |
| `mobile1` resolving to 320×568 (addon default) | 98 | 56 |
| `mobile1` resolving to 390×844 (story-defined `reviewViewports`) | 21 | 14 |
| `desktopReview` resolving to 1280×900 (story-defined) | 18 | 7 |
| `reset` (not a Storybook 10.6 preset) | 1 | 1 |
| Legacy `parameters.viewport.defaultViewport: "mobile1"` only | 1 | 0 |
| No viewport requested | 603 | n/a |

Stories with no viewport request run in a 980×380 frame: the 1280×720 page, less the manager's sidebar and addon panel.

## Finding 1: timing race. Every play function starts before the requested size is applied.

**What happens**
- All 77 stories that request a preset and have a play function start their play function at **980px wide**: 70 `mobile1` and 7 `desktopReview`.
- The `reset` story behaves the same way; it is covered under Finding 2.
- The manager applies the requested size later, while play is running or after it has finished.
- No story in this group starts its play function at the size it asked for.

**The 77 split by when the resize lands**

| When the resize lands | Count | What this means |
| --- | --- | --- |
| Mid-play: play ends at the requested width | 53 | Assertions that run before the resize run at 980px. Which ones do varies from run to run. |
| After play: the whole play runs at 980px | 24 | No assertion runs at the requested size. |

**Stable across repeats.** All three repeat runs started at 980px for every example. Only the moment the resize lands moved, by up to about 280ms (play durations of 505–827ms for the longer stories). Examples:

| Story | Requested | Start | End | Play duration (3 runs) |
| --- | --- | --- | --- | --- |
| `screens-community-pageshell--mobile-sort` | 320×568 | 980 | 320 | 551 / 540 / 505 ms |
| `screens-shell-mediashell--mobile-tabs` | 390×844 | 980 | 390 | 287 / 308 / 233 ms |
| `compositions-profiles-profilepage--visitor-mobile` | 390×844 | 980 | 980 | 8 / 8 / 6 ms |
| `screens-community-management-shell--mobile` | 320×568 | 980 | 980 | 12 / 9 / 9 ms |

**Stories whose whole play runs at 980px (24)**
- 20 request `mobile1`:
  - SignIn MobileSheet;
  - JoinAndName MobileCommunity and MobileSuccess;
  - CreatePostForm ContextualSongOverMobileNavigation;
  - SongChoice NoSongsYet;
  - Studying CompleteMobile;
  - Management Mobile;
  - LegalDocument PrivacyPolicyMobile;
  - PublicPostRoute SongPostMobile;
  - PersonaPublicProfile Mobile;
  - PublicProfilePage Mobile;
  - YourSongs NotYetAvailableMobile;
  - VerticalFeed Mobile;
  - AppHeader MobileMediaOverlayHeaderLoggedOut;
  - MobileFooterNav Default, SongsActive and Rtl;
  - ProfilePage VisitorMobile, LiveOwnProfileMobile and LiveVisitorMobile.
- 4 request `desktopReview`: the MediaShell CommunityApp {Desktop, ModeratorDesktop, AnonymousDesktop} and AnonymousProductionDefaults stories.
- Some of these do not depend on the frame width. For example, SignIn, JoinAndName and CreatePostForm render the phone branch with a `forceMobile` prop.
- So "ran at 980px" is a gap in what CI exercises. It is not automatically a broken assertion. The control below separates the two.

## Finding 2: mismatches. The requested size is never reached, or the wrong one is reached.

These hold regardless of timing.

1. **Height is never the requested height.**
   - Every preset story settles at a frame height of **298px**, not 568, 844 or 900.
   - In a 1280×720 page with the addon panel open, the manager cannot give the frame the requested height.
   - Width matches after the resize; height never does.
   - Any assertion about vertical fit, scroll or the visible fold is checked against a frame shorter than the story asked for.
2. **`desktopReview` (1280×900) cannot fit the visible canvas.**
   - The frame does reach 1280px wide, but the manager's visible canvas is about 980px wide in a 1280px page, so it is wider than the visible area. Height is 298px, not 900px.
3. **`reset` lands on a phone width.**
   - Story: `flows-connected-community-join-and-name--desktop-close-and-return-from-profile-menu`.
   - It requests `viewport.value: "reset"`, intending desktop. Storybook 10.6's addon has no `reset` preset.
   - In every run its play starts at 980px and ends at **320px**, even as the first story in a fresh page.
   - So the "Desktop" variant finishes at phone width.
   - Cause not confirmed. The story spreads the `mobile1` variant and overrides `globals`.
4. **The legacy `parameters.viewport.defaultViewport` is ignored.**
   - Story: `flows-community-create--mobile-avatar`.
   - It requests phone only through this legacy parameter, and stays at 980px.
   - It has no play function, so no assertion is affected; its capture is desktop-width.

## Finding 3: were phone-specific assertions executed, skipped or failed?

| Outcome | Stories | Evidence |
| --- | --- | --- |
| Executed at the requested size from the start, under CI navigation | **0 of 77** | Finding 1 |
| Pass at 980px in CI **and** pass at the requested size in the control | 74 | `control.jsonl` |
| **Pass in CI, fail at the requested size** | **3** | listed below |
| Phone branch **skipped** by an explicit width branch | 1 | FlatTabs, below |

### Three stories pass in CI but fail at the size they request

All three are reproducible. Load the story's preview frame (`iframe.html?id=…`) at 320×568 and the play function fails.

**`screens-community-communitypage-posting--full-width-composer-on-mobile`**
- `expected 0 to be greater than 0`.
- Under manager navigation its play starts at 980px and the resize lands about 0.5–0.7s in.

**`screens-community-communitypage-posting--mobile-composer-inside-the-app-shell`**
- Same assertion: `expected 0 to be greater than 0`.

**`screens-community-management-shell--mobile`**
- `Unable to find an accessible element with the role "button" and name "Close community management"`.
- Under manager navigation its whole play runs at 980px in about 10ms.

Not established here: whether each of these is a product defect or a story that assumes the wrong layout.

### Skipped phone branch

`patterns-navigation-flattabs--tab-bar-with-buttons` (`flat-tabs.stories.tsx:59`) branches on `matchMedia("(min-width: 768px)")`. Its phone branch asserts equal columns. The story requests no viewport, so in CI it always takes the desktop branch, and the phone assertion never runs.

### Notes on the 74

- Passing at both sizes means each assertion holds at both widths. It does not show that the phone layout was verified.
- Some of these 74 make no width-specific claim at all.
- Classifying each assertion individually was out of scope.

## Not covered

- **Sampling.** Frame size is sampled at render-phase boundaries only, so the exact moment of the resize inside a play function is bounded, not measured.
- **H.264.** Six `VideoPost/Authoring` stories errored in this container because its Chromium has no H.264 support. These are the known H.264 failures, unrelated to viewport.
- **Branches.** The open PRs were not probed. #69's phone-wait change is not on `main`, so its three stories are measured here as they are on `main`.
- **Headless only.** Results are from headless Chromium in a cloud container. Devices, staging and real Stream playback remain unverified.

## Reproducing

From a checkout of `32c35aa7`, after `bun install` and `bun run build-storybook`:

```
python3 -m http.server 6230 --directory storybook-static & SRV=$!
node probe.mjs "$PWD" http://127.0.0.1:6230 out.jsonl '<story-id regex>'
node control.mjs "$PWD" http://127.0.0.1:6230 ids.json control.jsonl
kill $SRV
```

`ids.json` is a JSON array of `[storyId, width, height]`.

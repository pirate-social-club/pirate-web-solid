# Final acceptance evidence, slices 1a and 1b

## What was tested

- **Source:** every artifact here was produced from `f7bd144`, the review follow-up. Commit `b56d98d` after it changes documentation only, and `git diff f7bd144 HEAD -- src packages .storybook` is empty.
- **Environment:** Node 24.21.0 and Bun 1.4.2. The browser is Playwright's Chromium 1194, launched from `/opt/pw-browsers` because the pinned Playwright expects build 1243.
- **Captured:** 2026-10-12, UTC.

## Storybook production builds

| Catalog | Command | Result | Index entries | Log |
| --- | --- | --- | --- | --- |
| App (`.storybook`) | `storybook build` | Completed, exit 0, Vite 1m 7s | 827 | `builds/app-storybook-build.log` |
| Design system (`packages/solid-ui`) | `storybook build` | Completed, exit 0, Vite 52s | 286 | `builds/design-system-storybook-build.log` |

## Full-catalog axe and interaction sweep

**How it ran**
- `scripts/storybook-a11y-sweep.mjs` with no filter.
- It ran against the **production build** of the app catalog, served statically, not against a dev server.
- 21:27–21:45 UTC.

**Results**

| Check | Result |
| --- | --- |
| Stories | 760 in 131 files, all selected |
| Axe | 757 pass, **0 violations**, 3 indeterminate |
| Interactions | 751 pass, 6 fail, 3 indeterminate |
| Stories in the areas these slices touch | **88 of 88 pass** both axe and interaction |

The touched areas are PageShell, Profile, RewardPill, VideoDelivery, Shared engagement, PostEngagement, PublicPostRoute, SongPlayback, PublicProfilePage, PersonaPublicProfile and Account access.

**All nine non-passing stories are in `Flows/Posts/VideoPost/Authoring`, and they predate this work.**
- The same nine fail identically at `45d07cb`. That baseline was built from a clean worktree and swept under the same conditions; see `sweep/authoring-at-45d07cb*` and `sweep/authoring-at-f7bd144*`.
- **Cause:** this Chromium has no H.264 encoder. The page error is "This specific encoder configuration (avc1.640015, 500000 bps, 240x426) is not supported in this environment."
- The authoring flow does not import any module these slices changed.

**Ledger files**
- `sweep/full-catalog-ledger.compact.jsonl`: one record per story, holding the id, title, import path, axe and interaction results, timing and panel evidence.
- The raw ledger is 256 MB because it embeds every channel event, so it is not committed. Its SHA-256 is in `sweep/full-catalog-ledger.raw.sha256`.
- `sweep/full-catalog-run.log` and `sweep/full-catalog-summary.txt` hold the runner output.

## Captures from the production build

These are full-page captures in dark scheme, at 390 px for phone and 1280 px for desktop. `captures/capture-report.json` lists page errors (none) and the measured card boxes.

| File | Story | Paper reference |
| --- | --- | --- |
| `compare-postcard-phone.png` | `Screens/Community/PageShell/MixedKinds` @390 | PostCard 013, 014, 015 |
| `compare-profile-own-phone.png` | `Screens/Profiles/Profile/LiveOwnProfileMobile` @390 | Profile 205 |
| `compare-profile-visitor-phone.png` | `Screens/Profiles/Profile/VisitorMobile` @390 | Profile 207 |
| `compare-profile-no-handle-phone.png` | `Screens/Profiles/Profile/WithoutHandle` @390 | Profile 206 |
| `compare-profile-own-desktop.png` | `Screens/Profiles/Profile/LiveOwnProfile` @1280 | Profile 209 |

The bare captures beside them also include `MixedKinds` @1280, `VideoDeliveryStates`, `AdultVideoAccess` and `Patterns/Engagement/RewardPill/InPlace`.

**Network failures that remain:** song cards request the Megapot pool summary, and the Boost dialog requests its sponsor data. Storybook has no API behind these reads, so they return 404. Both reads existed before these slices. The video poster in the captures is the review fixture image, not product media.

## Song-playback cold-start timeout

**What happened:** at slice 1b, `song-feed-playback-check` failed once. It timed out on its first click, 60 s after its spawned Storybook served `index.json`. An immediate rerun passed.

**Reproduction attempt:** I tried to reproduce it four times, repeating the original sequence each time: a production Worker build followed immediately by the check. See `builds/song-feed-playback-cold-start-repro.log`.

| Runs | Condition | Result |
| --- | --- | --- |
| 1–2 | No other Storybook running | Passed, 68 s each |
| 3–4 | A warm dev server on 6006, as at the original failure | Passed, 73 s and 67 s |

**The cause is not established.** The failure did not reproduce in 4 attempts. The check gives the first lazily compiled story 60 s after readiness, and an unproven explanation is CPU contention at that moment. This is recorded as an unexplained single failure, not as a known flake.

## Not covered

- Real Stream video playback.
- Device, staging and production checks.
- Pixel diffing; the measurements are computed-style checks against the Paper JSX values.
- The API release gate for slice 1c stays in place.

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

**Follow-up investigation (2026-10-13): cause established, and it predates this work.**

- **Where it reproduced:** the check failed again inside the repository's full `bun run verify`. Under that sequence it then failed on every run, whether the cache was cold or warm.
- **What the time goes on:** the check starts a fresh Storybook dev server and gives the first story 60 s to become clickable. A fresh server compiles the story's module graph on first visit, after one optimizer reload at about 9 s. The same story on an already-warm server renders in 2 s.
- **Timing:** I timed a fresh server, alternating the two commits, with 4 CPUs and a load average of about 2:

  | Commit | Time to the play button |
  | --- | --- |
  | `45d07cb` (baseline) | 89.0 s, 87.4 s |
  | `f7bd144` source | 78.4 s, 77.5 s |

- **Baseline result:** the check itself, run in a clean `45d07cb` worktree, **fails the same way** after 82 s.
- **Conclusion:** first-load compile time in this container exceeds the check's 60 s budget at both commits, and this work makes it faster, not slower. The earlier passes, at 67–73 s for the whole check, came while the container was running faster.
- **Not changed here:** the check is unchanged in this work. Whether GitHub's runners fit inside the budget shows in CI. A robustness fix, such as waiting for the first story render before the 60 s action timeout, belongs to the check's owner.

## Not covered

- Real Stream video playback.
- Device, staging and production checks.
- Pixel diffing; the measurements are computed-style checks against the Paper JSX values.
- The API release gate for slice 1c stays in place.

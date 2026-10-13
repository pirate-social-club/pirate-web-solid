# Slice 2 evidence: community page, home feed, post page, cleanup

## What was tested

- **Source:** every artifact here was produced from `3d6ffc7`. Commit `66bbe6b` after it changes documentation only, and `git diff 3d6ffc7 HEAD -- src packages .storybook` is empty.
- **Environment:** Node 24.21.0 and Bun 1.4.2. The browser is Playwright's Chromium 1194, launched from `/opt/pw-browsers`.
- **Captured:** 2026-10-13, UTC.
- **CI:** verify, storybook-audit and Solid Doctor all pass on PR #60 at `66bbe6b`.

## Storybook production build

| Catalog | Command | Result | Log |
| --- | --- | --- | --- |
| App (`.storybook`) | `storybook build` | Completed, exit 0 | `builds/app-storybook-build.log` |

The design-system catalog was not rebuilt for this slice. Its CI `storybook-audit` job passes at `66bbe6b`.

## Full-catalog axe and interaction sweep

**How it ran**
- `scripts/storybook-a11y-sweep.mjs` with no filter.
- It ran against the production build of the app catalog, served statically.
- 09:12–09:34 UTC.

**Results**

| Check | Result |
| --- | --- |
| Stories | 780 in 130 files, all selected |
| Axe | 777 pass, **0 violations**, 3 indeterminate |
| Interactions | 771 pass, 6 fail, 3 indeterminate |
| Stories in the areas slices 1 and 2 touch | **202 of 202 pass** both axe and interaction |

The touched areas are PageShell, CommunityPage, HomeVideoFeed, VerticalFeed, PublicPostRoute, PostEngagement, comments, MobilePageHeader, MediaShell, RewardPill, VideoDelivery and the profile stories.

**The nine non-passing stories are the same nine `Flows/Posts/VideoPost/Authoring` stories recorded in `evidence/final/`.**
- Their cause is unchanged: this Chromium has no H.264 encoder.
- They pass in CI.

The catalog moved from 760 stories in 131 files to 780 in 130:
- slice 2 added stories;
- the cleanup deleted the Dance prototype story file.

**Ledger files**
- `sweep/full-catalog-ledger.compact.jsonl`: one record per story, in the same format as `evidence/final/`.
- The raw ledger is not committed because of its size. Its SHA-256 is in `sweep/full-catalog-ledger.raw.sha256`.
- `sweep/full-catalog-run.log` and `sweep/full-catalog-summary.txt` hold the runner output.

## Captures from the production build

These are full-page captures in dark scheme, at 390 px for phone and 1280 px for desktop. `captures/capture-report.json` lists the errors for each story.

There are no page errors. The only console entries are 404s for reads that have no API behind Storybook: the Megapot pool summary and the Boost sponsor data.

| File | Story | Paper reference |
| --- | --- | --- |
| `compare-community-178-visitor-phone.png` | `CommunityPage/PaperVisitor` @390 | 178 |
| `compare-community-179-following-phone.png` | `CommunityPage/PaperFollowingNotMember` @390 | 179 |
| `compare-community-181-more-desktop.png` | `CommunityPage/PaperMoreDesktop` @1280 | 181 |
| `compare-community-182-more-phone.png` | `CommunityPage/PaperMorePhone` @390 | 182 |
| `compare-community-183-desktop.png` | `CommunityPage/PaperMember` @1280 | 183 |
| `compare-community-185-member-phone.png` | `CommunityPage/PaperMemberPhone` @390 | 185 |
| `compare-community-186-about-phone.png` | `CommunityPage/PaperAboutPhone` @390 | 186 |
| `compare-feed-169-desktop-signed-in.png` | `HomeVideoFeed/SignedInDesktop` @1280 | 169 |
| `compare-feed-170-mobile-signed-in.png` | `HomeVideoFeed/SignedInMobile` @390 | 170 |
| `compare-feed-171-more-sheet.png` | `HomeVideoFeed/MobileMoreSheet` @390 | 171 |
| `compare-feed-172-report-reasons.png` | `HomeVideoFeed/MobileReportReasons` @390 | 172 |
| `compare-feed-173-desktop-more.png` | `HomeVideoFeed/DesktopMoreMenu` @1280 | 173 |
| `compare-feed-174-desktop-report.png` | `HomeVideoFeed/DesktopReportDialog` @1280 | 174 |
| `compare-feed-175-loading.png` | `HomeVideoFeed/Loading` @390 | 175 |
| `compare-feed-176-empty.png` | `HomeVideoFeed/NoVideos` @390 | 176 |
| `compare-feed-177-error.png` | `HomeVideoFeed/FailedFirstPage` @390 | 177 |
| `compare-post-210-text-member-phone.png` | `PublicPostRoute/PaperPhoneTextMember` @390 | 210 |
| `compare-post-211-song-member-phone.png` | `PublicPostRoute/PaperPhoneSongMember` @390 | 211 |
| `compare-post-212-visitor-phone.png` | `PublicPostRoute/PaperPhoneVisitor` @390 | 212 |
| `compare-post-213-desktop-text.png` | `PublicPostRoute/PaperDesktopTextMember` @1280 | 213 |

Each `compare-*` image shows the Paper sheet beside the Storybook capture.

### Differences visible in the captures

All of these are recorded in `RECONCILIATION-LOG.md` under "Recorded differences from Paper".

- **Post page:**
  - there are no comment vote pills, because no endpoint exists;
  - fixture text differs, for example the comment count (3 vs 24) and avatar initials.
- **Home feed sheet and menu:**
  - Boost is absent, because Rewards stays fixture-only;
  - Report is shown in these stories, but the live feed gates it off until the API resolves video reports.

## Not covered

- Real Stream video playback.
- Device, staging and production checks.
- Pixel diffing.
- The API release gate for slice 1c stays in place.

# Paper ↔ Storybook reconciliation: handoff

Status as of 2026-10-14 ~04:00 UTC.

**Read this first.** It assumes no context: what the goal is, the rules, what is done, what is open and what is left. It also says how to check every claim yourself. Treat every "done" below as a claim to verify, not a fact (see "Audit before you build").

## 1. Goal

Make the pirate-web-solid app, and both Storybook catalogs, match the Paper design sheets 1:1, unless there is an explicit, recorded reason not to.

**Where the Paper reference lives:** branch `origin/handoff/paper-storybook-20261012`, under `docs/design-handoff/2026-10-12/`. It holds:
- `boards/*.png`: one image per sheet;
- `states/*.png`: per-state exports;
- `reference/jsx/*.jsx.txt`: exact Paper copy and classes;
- `DESIGN-INDEX.csv`: the sheet → file index, with dependency notes;
- `authority/`: the owner rulings. These override older docs;
- `reference/tokens.css`.

**Two catalogs:**
- **App:** `.storybook`, about 783 stories.
- **Design system:** `packages/solid-ui`, about 223 stories.

## 2. Hard rules (from the owner and reviewers; all still in force)

**Scope**
- No deploys.
- No Rewards enablement.
- No changes to `api-next`.

**Git**
- No pushes to `main`.
- No force-pushes, rebases or squashes on shared branches.
- To update a branch, merge `main` into it normally.

**Owner decisions**
- Owner decisions stay **pending**.
- Never implement a reviewer's recommendation as if it were a decision.
- Section 6 lists them.

**Reserved areas: do not touch**
- The **naming / Spaces** flows: the JoinAndName "name" → "handle" copy, the Join dialog file (`src/features/communities/community-join-name/`) and Address/Spaces.
- A separate workstation session owns that lane.

**Separation**
- Keep cleanup and deletions in separate PRs from behaviour fixes.

**Tests**
- Never disable or skip a test, and never turn off an axe rule, to get green.
- If a story leaves a modal open and axe complains, close it at the end of the play function.

**Evidence**
- Every fix carries a browser check: a Storybook `play` function that measures with `getComputedStyle` or `getBoundingClientRect`, so CI's `storybook-audit` enforces it.
- A name match between a sheet and a story is **not** evidence of parity. Measure.

**API release gate**
- The frontend must be serving and verified before the API returns videos (slice 1c).

**Commits and PRs**
- No model identifiers in commits or PRs.
- Commits end with the session's `Co-Authored-By` / `Claude-Session` footer when one is given to you.

## 3. Open PRs (pirate-web-solid)

All six were green (verify, storybook-audit, Solid Doctor) at the heads below, with **no reviews or comments yet**. None is merged. `main` = `f668c09`.

| PR | Branch | Head | What it is |
| --- | --- | --- | --- |
| **#60** | `ccr-1bb64139-1xpaas` | `15c4db1` | The big one: home video feed, post page, community page and profile to Paper (slices 1a, 1b and 2), plus cleanup. **Frozen:** awaiting source review, a register pass and an authorized approval and merge, not more implementation. It carries main `f668c09` via merge `39f21cc`. Its review log is `docs/design-audit/2026-10-12/RECONCILIATION-LOG.md` on that branch. |
| **#66** | `paper-shared-fixes` | `98b8254` | Shared design-system fixes: DropdownMenu clipping and focus outline, class-after-spread in 60 tags across 23 files, flat Input and Textarea padding, AutoResizeTextarea, FormattedTextarea inset, RadioGroup horizontal plus description and error, overline 16/20, shadow tokens in `@theme`, a global reduced-motion rule, Tooltip top with a 4px gutter, and a 4px gutter on Select, Combobox and MultiCombobox. |
| **#67** | `paper-shared-fixes-2` | `4b6b45f` | Batch 2: side sheets as a flex column, muted ModalDescription, icon Button loading without its child, Avatar xs, CommunityAvatar xs initials, FlatTabs natural width on desktop (ruling 5), ConfirmDialog story destructive, and the Label story copy. |
| **#68** | `paper-ruling1-cleanup` | `aad652e` | Ruling 1 deletions: ActionBanner, IllustratedState, StatusCard, ListRow, MediaUploadField, AvatarBadge, StackPageShell, StackedSectionNav and CardShell, with their exports, SSR tests and Solid Doctor baseline entries. **AppHeader and the design-system Sidebar are deliberately kept** (see section 6). |
| **#69** | `paper-story-fixes` | `c2aec36` | Story-only changes: frames sized to the boards, copy and resting states, and missing board states. Helpers are in `packages/solid-ui/src/stories/lib/story-measure.ts`. |
| **#72** | `paper-dialogs-copy` | `78e9a92` | Sign-in dialog at 440px with radius 16, padding 16/20/20 and a 14px error, which cannot close while signing in. Boost dialog at 440px. "Daily lottery" / "You're entered." "Pirate buys and holds the ticket(s)" removed. "(optional)" removed from Lyrics and Title. |

**Known interactions**
- **#66 × #68 conflict** in `packages/solid-ui/src/patterns/layout/layout-shell/layout-shell.tsx`. This is the only pairwise conflict among the six; it was checked with `git merge-tree`.
  - Resolve it on whichever PR merges second.
  - Keep `PageContainer` with `{...rest} class={className()}`, which is #66's class-after-spread, and drop `CardShell`, which is #68's deletion.
- **`scripts/song-feed-playback-check.mjs`:** #60, #66 and #72 carry an identical render-wait fix, so whichever lands first makes it a no-op for the others.
  - The reason for it: without the fix, the check times out on a cold Storybook dev server.
- **#60** deletes `src/features/rewards/reward-sponsor-action.tsx`, which is main's old Boost "Song actions" control. The `RewardSponsorDialog` story harness on main still shows a "Song actions" trigger, which is not in Paper. After #60 merges, change that story's trigger. That is follow-up work, not yet done.

**After #60 merges**
- Merge main into #66, #67, #68, #69 and #72, and re-verify each.

## 4. The remaining-sheets audit (this directory)

| File | What it is |
| --- | --- |
| `REMAINING-SHEETS-AUDIT.md` | Report, revision 2, which carries an independent review's corrections. 89 sheets: 18 match, 38 minor, 26 major, 7 without a story. 320 differences, 112 of them browser-measured. |
| `findings/<group>.jsonl` | One record per sheet: the Paper refs, stories, viewports, states checked, and every difference with `measured`, `class` and `files`. |
| `findings/<group>.md` | Human summaries and proposed fixes. |
| `findings/SHARED.md` | Shared design-system findings F1–F20. |
| `AUDIT-METHOD.md` | The brief the auditors followed. |

**Paths in the audit**
- It was run at source `67d6b7a`, the head of #60 before its main refresh.
- The paths in `AUDIT-METHOD.md` and the `evidence/...` paths point to a temporary scratch directory that **no longer exists**. The captures and side-by-sides are gone, so re-capture what you need.
- `$H` in the method means the Paper handoff branch named in section 1.

**Difference classes:** fixable, api-dependency, owner-decision, intentional, unverified, missing-story.

## 5. Status of every proposed slice

Slice numbers are from `REMAINING-SHEETS-AUDIT.md`, "Proposed small PR slices".

| # | Slice | Status |
| --- | --- | --- |
| 1 | Foundations | **Done in #66:** F1 overline, F4 shadows in `@theme`, F2 reduced motion via one global rule (85 unpaired strings no longer matter). **Not done:** F3, the design-system Sidebar's layout-property transitions. It affects only the design-system Sidebar and its stories, which wait on the ruling 1 decision. |
| 2 | Overlay primitives | **Done:** F5 and F19 (#66), F7 and F8 (#66), F6 side-sheet layout (#67), F18 muted description (#67), F17 ConfirmDialog destructive (#67). **Pending owner:** the sheet and phone-modal close X, and the scrim blur. |
| 3 | Form controls | **Done in #66:** F9, F10, F11 (cause: class leaking through `{...rest}` in production builds) and F16. **Not done:** F12, MultiCombobox chips are full pills where Paper uses medium radius. **Not done shared:** FormNote 14/20. #72 fixed only the sign-in error line locally; `FormNote`'s caption variant still renders at 16px. |
| 4 | Actions and data display | **Done in #67:** F13, F15 and CommunityAvatar xs. **Not done:** F14, ItemMedia has no fallback when an image fails to load. |
| 5 | Story hygiene and coverage | **Mostly in #69.** Verify each item against the `missing-story` records in the ledgers. The 17 missing-story states may not all be covered. |
| 6 | Ruling 1 deletions | **#68.** AppHeader and the design-system Sidebar are held (section 6). |
| 7 | Copy pass | **Done in #72:** lottery, Boost wording, "(optional)". **Not done, and reserved:** the JoinAndName handle wording. Do not touch it. **Also not done:** making Title required with an asterisk (ruling 10), which goes with slice 9 because it changes composer behaviour. |
| 8 | Dialog geometry | **Done in #72:** SignIn and Boost. **Not done, and reserved:** the Join dialog, 440 wide, padding 24/20/20, 18px title. It lives in the reserved naming file. |
| 9 | Post composer, rulings 10–12 and 14 | **Not started.** Step titles on phone, a labelled footer Next/Post instead of the arrow icon, desktop "New post" and close X instead of "Create a post" plus Cancel, Title required, and a centred "uploading" and "posted" state. The composer is live, so it needs a state-machine review. |
| 10 | Studying, owner-ruled | **Not started.** Close mark, "You said:", the result box, Continue on a wrong answer, a 640px column. This touches the shared activity header, so Karaoke changes too. |
| 11 | Wallet and Management | **Not started.** Portfolio column, Receive as a 480px dialog, and the raw capability label in the Management moderator view. |

**Recommendation:** start slices 9–11 only after some of the six open PRs have merged, to avoid stacking conflicts. Cut each one from fresh `main` on its own named branch.

## 6. Pending owner decisions (record only; do not implement)

**From #60**
- Member Unfollow.
- The visitor Profile button.
- Reply loading.

**From the audit**
1. **Ruling 1 vs AppHeader.** AppHeader is live and imports `createSidebar` from the design-system `sidebar.shared.ts`. Keep both, or replace and then delete?
2. **Overlay chrome.** Paper draws no close X on sheets or the phone modal. Is a drag handle plus Escape enough? Should the scrim's `backdrop-blur-sm` stay?
3. **FormattedText.** Should bare URLs auto-link? That changes how live posts render.
4. **Tabs underline variant.** Remove the second tab style?
5. **"Under review" sheets.** These are unapproved designs, so all 43 `class: "owner-decision"` differences in the ledgers stay pending. Examples: Boost's 3-step flow, YourSongs row, Karaoke notice copy, ActivityResult layout, VerifySheet and PayStep, the Portfolio network switch, and SignIn method marks.

**Already settled:** "Optional" labels. Ruling 10 forbids them.

## 7. API dependencies (record only; `api-next` is out of scope)

| Area | What's missing |
| --- | --- |
| Feeds and posts | Video in feeds; video reports. |
| Communities | Leave; Spaces "Proposed" / "Candidate". |
| Comments | Anonymous comment reads; comment votes. |
| Songs | Artist field; instrumental and vocals uploads; song-match check; add collaborator. |
| Rewards | Reward data, the rewards page and Megapot "already running"; the drawing date/time for "Drawing on <date>" in the participant box. |
| Streak | All of it. |
| Notifications | A list contract and the `/activity` route. |
| Wallet | Mainnet claim and send; balances and activity. |
| Management | Profile, rules and links editing. |
| Dance | Recorded prerequisites. |

## 8. Audit before you build

Do this first; it is the point of the handoff. The audit is a snapshot at `67d6b7a`; six PRs have landed on top of that in branches since.

**1. Re-establish the state.**
- `git fetch origin`
- Check each PR in section 3: head SHA, CI on that head, mergeability, any new reviews.
- If anything has merged, re-run the `git merge-tree` pairwise conflict check.

**2. Verify the "done" claims.**
- For each finding marked done in section 5, find the browser check in the PR (the story name is in the PR description).
- Build Storybook from that branch and confirm the check measures the Paper value, not just that it passes.
- Treat a check that only asserts presence as insufficient.

**3. Spot-check the audit itself.**
- The 320-row ledger was not independently verified beyond the claims in revision 2.
- Re-measure a sample of `measured: true` rows against the Paper JSX and board, especially the `major` sheets in `flows-a`, `flows-b-screens` and `parts`.
- Re-check anything marked `unverified`.

**4. Check signed-out, member and visitor states** wherever a sheet has them. The audit found these bugs only by checking the real shell.

**5. Report before implementing.**
- List the findings and the proposed small slices first.
- Classify each one as fixable, api-dependency, owner-decision or intentional.

## 9. How to run things

**Setup**
- Node 24, Bun, Playwright Chromium. In cloud containers, use `executablePath: /opt/pw-browsers/chromium` or `PLAYWRIGHT_BROWSERS_PATH`.
- Set environment variables in separate statements: `export A=x B=$A` expands `$A` before it is set.
- A fresh worktree needs a real `bun install`. Symlinked `node_modules` break Vite's fs-allow and Vitest.

**Full gate:** `bun run verify`. It covers:
- tsc, lint and story-parity;
- test discovery;
- app, SSR and design-system tests;
- the icon checks: no hand-authored SVG, including `data:` URIs;
- Solid Doctor, against `.solid-doctor-baseline.json`;
- the end-to-end checks: text-post, song-post, song-feed-playback, community-feed-hydration and locale-hydration.

On a fresh worktree, the first text-post-check can fail on Vite's deps optimizer. Re-run with a warm cache.

**Storybook**
- Build: `npx storybook build -c .storybook -o <dir>` for the app catalog. The design-system catalog builds from `packages/solid-ui`.
- Serve and sweep in one command, and kill the server when done:
  ```
  python3 -m http.server PORT --directory <dir> & SRV=$!; node scripts/storybook-a11y-sweep.mjs --base-url http://127.0.0.1:PORT --filter '<regex>' --ledger <f> --summary <f>; kill $SRV
  ```
  Never leave servers running.

**Known local noise**
- Nine `Flows/Posts/VideoPost/Authoring` stories fail in containers without H.264, but pass in CI.
- Real Stream playback, devices and staging have never been verified.

**Gotchas found along the way**
- **Solid 2 prop order:** in a wrapper, put `class` **after** `{...rest}`. Otherwise the raw class leaks in production builds.
- **Kobalte:** it reads `placement` and `gutter` from the **root**, not from Content.
- **Tailwind v4:** shadow utilities need `--shadow-*` in `@theme static`, not in `:root`.

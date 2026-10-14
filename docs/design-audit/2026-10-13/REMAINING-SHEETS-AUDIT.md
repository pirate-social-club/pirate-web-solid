# Remaining Paper sheets: audit report and proposed slices

**Revision 2.** This revision applies the independent review's corrections: the F2 count, F3 and F16 scope, the Sidebar dependency trace, the "Optional" label (settled by ruling 10) and the verdict totals (89). The 320-row ledger has not been independently verified beyond the claims the review lists.

This audit is read-only. No repository changes were made and nothing was pushed.

## What was checked

**Source:** `67d6b7a`, the current head of PR #60. That branch was left untouched. The source SHA is in `SOURCE_SHA`.

**Builds:** static Storybook builds of both catalogs, served from this directory:
- the app catalog (`app-static`, 783 stories);
- the design-system catalog (`ds-static`, 223 stories).

**Evidence:** everything is under `audit-rest/`.

**Signed-out phone capture:** I added one audit-only story in a detached worktree (`wt/`), which was never committed. It renders the real MediaShell around the signed-out HomeVideoFeed.

**Order:** Foundations first, then Components, Patterns, Parts, Flows and Screens. Later auditors were given the shared findings first (`findings/SHARED.md`), so they attribute a screen symptom to its shared cause instead of reporting it again.

**Coverage:** 89 sheets audited. PR #60 already covers the other 6: PostCard, RewardPill, Profile, CommunityPage, Feed and Post.

**What each record holds:** every sheet has one record in `findings/<group>.jsonl`. It gives:
- the Paper reference (board, state PNGs and JSX);
- the stories;
- the source commit;
- the viewports;
- the states checked;
- every difference, with `measured` true or false and its class;
- the evidence paths.

Each group's `.md` has a human summary and that group's proposed fixes.

**Evidence integrity:** some captures were first taken with a fixed 1.5 s wait. I recaptured every story-named image with a render-complete wait and diffed the results. Where a difference appeared, it was a centring offset from a different viewport height, with identical content. The Flows B and Screens group redid all 292 of its captures, and the page text matched the first pass byte for byte. No finding rests on a capture taken before the story rendered.

## Results

| | Count |
| --- | --- |
| Sheets in the ledgers | 84, plus 5 Foundations sheets (`findings/foundations-and-signed-out.md`) |
| Match | 15, plus 3 Foundations |
| Minor | 36, plus 2 Foundations |
| Major | 26 |
| No story | 7 |
| **Total** | **89** |

Correction (review of 2026-10-13): the first version of this table summed to 88, because it left out one Foundations sheet. The five Foundations verdicts are:
- **Match:** Color (measured); Spacing & Sizing and Radius & Elevation (code only, not browser-measured).
- **Minor:** Typography and Motion.

Not checked:
- Paper's PNGs for Claim 123, Send 112 and Portfolio 200 are 1×1 exports, so those three states could not be checked.

**Differences by class (320 in total, 112 of them browser-measured):**

| Class | Count |
| --- | --- |
| Fixable | 172 |
| API dependency | 54 |
| Owner decision | 43 |
| Unverified | 20 |
| Missing story | 17 |
| Intentional | 14 |

A name match did not establish parity anywhere. `sheet-to-story-map.csv` labels Wallet/Portfolio and Karaoke/Practice "exact", but both are major.

### Foundations, measured
- **Colour:** all 29 tokens match, including the two computed with `color-mix`.
- **Type:** 9 of 10 variants match.
- **Radius, shadows, control heights, header and gutters:** match in code.
- **Sheet, accordion and spinner timings:** match.
- **Font family:** intentional. The Typography board says Inter stands in for the system font stack.

### Shared design-system findings (`findings/SHARED.md`)

**Type and motion**

| ID | Finding |
| --- | --- |
| F1 | `overline` renders at 16/24; Paper specifies 16/20. Measured. |
| F2 | 85 production class strings have a transition utility and no `motion-reduce` partner: 52 in 29 design-system files and 33 in 18 app files. The Motion board requires pairing. The first count, 106, was wrong; it also matched stories, tests and loose text. Independently reproduced: Input still transitions for 150ms with reduced motion on. |
| F3 | The design-system Sidebar animates layout properties: width, `left`/`right`, height and padding. **Correction:** the live app draws its sidebar with its own `AppSidebar`, so this affects only the design-system Sidebar and its stories, not live screens. |

**Overlays**

| ID | Finding |
| --- | --- |
| F4 | `shadow-sm` to `shadow-xl` render Tailwind's defaults. The `--shadow-*` tokens are set in `:root` but never mapped in `@theme`. This affects 7 overlay sheets. Measured. |
| F5 | DropdownMenu caps its height (`max-h-96` with `overflow-hidden`), which clips the last item. |
| F19 | Menus opened with a pointer show the browser's focus outline. |
| F6 | Side sheets stretch their grid rows, so the body text drops far below the description. Sheets draw a close X that Paper does not. |
| F18 | Modal's phone sheet shows a close X, and its description uses the foreground colour where Paper uses muted. |
| F7 | Tooltip opens below its trigger with no gap. |
| F8 | Select, Combobox and MultiCombobox popovers sit 8px below the field; Paper uses 4px. |

**Form controls**

| ID | Finding |
| --- | --- |
| F9 | RadioGroup has no horizontal segmented orientation. |
| F10 | The flat variants of Input and Textarea keep their padding. |
| F11 | AutoResizeTextarea renders unstyled. Measured; cause unconfirmed. |
| F12 | MultiCombobox chips are full pills; Paper uses medium radius. |
| F16 | The design-system FormattedTextarea story has no side padding (measured: text 1px inside the border). **Correction:** the independent review measured the live post-page comment field at 390 and found 16px side padding, so the live claim was wrong. The comment sheet composer (`post-engagement.tsx:785`) uses this component and is checked when it is fixed. |

**Actions and data display**

| ID | Finding |
| --- | --- |
| F13 | Button at icon size shows its child as well as the spinner while loading. |
| F14 | ItemMedia has no fallback when an image fails to load. |
| F15 | FlatTabs stretches desktop tabs, against owner ruling 5. |
| F17 | ConfirmDialog stories are non-destructive; Paper always uses destructive. |

**Ruling 1 deletions (F20, checked against imports at `67d6b7a`)**
- **No production importer, so deletable:**
  - ActionBanner, IllustratedState, StatusCard, ListRow and MediaUploadField;
  - AvatarBadge, StackPageShell and StackedSectionNav;
  - CardShell, whose only user is StackPageShell.
- **Live callers (corrected dependency trace):**
  - **AppHeader** is live: it draws the phone header in `media-shell.tsx`.
  - **AppHeader** imports one helper from the design-system Sidebar module: `createSidebar`, from `sidebar.shared.ts`. It uses the helper for `toggleSidebar`.
  - **Nothing in the app imports the design-system Sidebar components** (`sidebar.tsx`, `sidebar.primitives.tsx`).
  - **The live sidebar is the app's own `AppSidebar`** (`src/features/shell/app-sidebar/`). It also exports its own `SidebarContent` and `SidebarItem`, which `media-shell.tsx` uses. The first version wrongly treated these as the design-system Sidebar.
  - **To delete the design-system Sidebar,** first remove or relocate AppHeader's `createSidebar` dependency, then trace again.

**Candidate shared items**
- **Overlay scrim blur:** the scrim uses `backdrop-blur-sm`, where Paper's scrim is sharp.
- **FormNote error line:** it renders at 16px, where Paper uses 14/20.

### Signed-out phone More (PR #60 fix `9be9252`), in the real shell at 390
| Element | Box (x, y, width × height) |
| --- | --- |
| Sign in | 294, 14, 84×36 |
| More | 330, 68, 56×56 |
| Header | 0–64 tall |

- There is no overlap; More sits 18px below Sign in.
- The sheet offers only "Unmute", and there were no page errors.
- **Unverified observation:** the unfilled white dots are faint over a bright frame.

## Proposed small PR slices

These start after #60 merges, on a fresh named branch cut from the updated main. Shared fixes come before screen-specific ones.

| # | Slice | Closes | Live risk |
| --- | --- | --- | --- |
| 1 | **Foundations:** F1 overline leading; F4 map the shadow tokens into `@theme`; F3 remove the sidebar's layout transitions; F2 add the `motion-reduce` partners | Typography, Motion and Radius-Elevation sheets; elevation on 7 overlay sheets | F4 changes elevation app-wide, though it is subtle on the dark background. The rest is low. |
| 2 | **Overlay primitives:** F5/F19 dropdown clipping and focus outline; F7 tooltip placement; F8 popover 4px offset; F6 side-sheet row layout; Modal description muted (F18); ConfirmDialog always destructive (F17) | DropdownMenu, Tooltip, Sheet, Modal, ConfirmDialog and ActionMenu | Medium: 10 app files use `SheetContent`, and every Select and Combobox moves by 4px. |
| 3 | **Form controls:** F9 RadioGroup horizontal orientation, opt-in so the persona switcher stays vertical; F10 flat padding; F11 AutoResizeTextarea; F12 MultiCombobox; F16 FormattedTextarea padding; FormNote 14/20 | Forms sheets (3 major, 5 minor), plus FormattedTextarea | Medium: the comment composer and persona switcher change. |
| 4 | **Actions and data display:** F13 Button icon loading; F14 ItemMedia fallback; CommunityAvatar xs initials; F15 FlatTabs ruling 5 | Button, Item, CommunityAvatar and FlatTabs | Low to medium: the live community tab bar. |
| 5 | **Story hygiene and coverage (no live code):**<br>• BadgedCircle's shared JSX node<br>• collapsed Scrubber, Waveform and LayoutShell stories<br>• ignored args<br>• story copy drift<br>• the VerticalFeed story's Like and Follow<br>• broken `/mascots` fixture<br>• the 17 missing-story states, including Karaoke mic blocked and no mic | Many minor verdicts | None. |
| 6 | **Ruling 1 deletions:** the 8 patterns plus CardShell. AppHeader and Sidebar wait for clarification. | Ruling 1 | Low: nothing in production imports them. |
| 7 | **Copy pass on owner-confirmed rules:**<br>• handle wording in JoinAndName, checked state by state because Paper also has 3× "Choose your name"<br>• "Daily lottery / You're entered"<br>• the Boost tickets wording<br>• "(optional)" labels, per ruling 10 | JoinAndName, ActivityResult, Boost and composer labels | Low: copy only, in locales. |
| 8 | **Dialog geometry:** SignIn, the Join dialog and the Boost dialog at Paper's 440 width and padding; Close disabled while signing in | SignIn, JoinAndName and Boost dialogs | Low. |
| 9 | **Post composer, owner rulings 10–12 and 14:** step titles, a footer Next/Post on phone, and the posted-song centred state | Flows/Posts/Text and Song | Medium: this is the live composer. Needs its own state-machine review. |
| 10 | **Studying owner-ruled changes:** close mark, "You said:", the result box, Continue on a wrong answer, 640px column. This touches the shared activity header, so Karaoke gets the close mark too. | Studying/Session and part of Karaoke | Medium. |
| 11 | **Wallet:** Portfolio column and Receive as a 480px dialog. **Management:** the moderator view's raw capability label. | Portfolio and Management | Low to medium. |

Each slice keeps the established evidence standard: production Storybook sweep, Paper side-by-sides at the sheet viewports, focused tests and full CI.

## Needs an owner decision; not resolved here

**Still pending from PR #60:**
- member Unfollow;
- the visitor Profile button;
- reply loading.

**New, raised by this audit:**
1. **Ruling 1:** AppHeader is live and depends on the design-system Sidebar module's `createSidebar` helper. Should AppHeader and that helper be kept, or replaced and then deleted?
2. **Overlay chrome:**
   - Paper draws no close X on sheets or the phone modal. Is a drag handle plus Escape enough?
   - Should the scrim blur (`backdrop-blur-sm`) stay?
3. **FormattedText:** should bare URLs be auto-linked? That would change how live posts render.
4. ~~**Label board:** it uses "Optional" as an example, which conflicts with ruling 10.~~ **Corrected:** ruling 10 already settles this. It is not an owner question; it is fixable. Replace the example in the Label story, and in the board-matching copy.
5. **Second tab style:** remove the Tabs underline variant (agent choice 7)?
6. **"Under review" sheets.** Their unapproved designs are classed as owner decisions:
   - Boost's 3-step flow;
   - the YourSongs one-line row;
   - Karaoke notice, interrupted and refused copy;
   - Video post flow details;
   - ActivityResult layout;
   - YourProfiles redesign;
   - a single VerifySheet and a shared PayStep;
   - StatusState instances;
   - Management queue layout;
   - Portfolio Mainnet/Testnet switch;
   - SignIn method marks;
   - the Create profile choice;
   - the Song matched result.

   43 differences in total; see `class: "owner-decision"` in the ledgers.

## API dependencies (recorded only)

| Area | What's missing |
| --- | --- |
| Feeds and posts | video in feeds (1c); video reports |
| Communities | leave; Spaces register "Proposed" / "Candidate" items |
| Comments | anonymous reads; votes |
| Songs | artist field; instrumental and vocals uploads; song-match check; add collaborator |
| Rewards | reward data; rewards page; Megapot "already running" |
| Streak | the whole family: week strip, compact form, leaderboard |
| Notifications | a list contract with kind, created_at, read_at, target, mark-read and a cursor; a fifth tab and an `/activity` route |
| Wallet | mainnet claim and send; palm check before send; balance, royalties and activity |
| Management | profile, rules and links editing |
| Dance | blocked by its recorded prerequisites; all 9 states recorded, none proposed |

## Unverified
- Real Stream playback: this headless Chromium has no H.264 support.
- Devices and staging.
- 3 Paper states exported at 1×1.
- 20 items marked unverified in the ledgers, each with its reason.
- Play functions that fail for reasons other than H.264:
  - **Composer phone stories, `scrollY` assertion:** `full-width-composer-on-mobile`, `mobile-composer-inside-the-app-shell` and `song-composer-in-main-on-mobile`. They fail here, and also at 320×568.
  - **`song-upload-progress`:** fails at 390 because the phone composer has no "Song" heading; it passes at 1280.
  - **Three Management Shell stories:** fail when captured at a width they were not written for.

  The composer stories still rendered, so they were recorded as unverified. The Management failures are story artefacts, not product defects.

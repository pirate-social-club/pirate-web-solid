# Parts audit (group `parts`), source 67d6b7a

These 11 sheets are "Later reference": every sheet except AppSidebar, SongEarnSheet and VerifySheet is captioned "Under review". Where a gap would mean adopting an unapproved design, I classified it as owner-decision. Where the caption cites an owner ruling (lottery wording, account menu, Settings page), I classified it as fixable. Reward and streak data stay fixture-only, so those gaps are api-dependency. Captures are at 390 for phone and 1280 for desktop, in `evidence/parts/` (raw captures are in `cap/`).

Some MediaShell, AppSidebar and Participant stories showed only the Storybook spinner with `tools/cap.mjs` after its fixed 1.5 s wait. I recaptured them with `tools/parts/cap2.mjs`, which waits for `sb-show-main`.

| Sheet | Verdict | Key differences |
|---|---|---|
| Identity/YourProfiles | major | The list is flat, with no community headings. Rows use radio indicators instead of chevrons or checks, and show two-line name+handle labels where Paper shows the handle alone. Measured: 72px rows (Paper 60px), 48px avatar on background (Paper 40px on secondary), title 20/28 (Paper 24/30), sheet radius 24 (Paper 20), no card box. A clipped focus ring shows under the selected row on open. The close X is F18. |
| Payments/PayStep | no-story | There is no shared pay step. The nearest is the Create a bounty sheet: inline Pay/Back, a text-only sending state and an inline alert for errors. The Confirm (unlock) step has no story. The design is "not yet approved". |
| Rewards/ActivityResult | major | Measured as matching: headline 24/32 and score 72/72. The code adds Correct/Missed tiles and an inline reward card. Study again appears on every page. Lottery copy says "Your Megapot share" where the owner-confirmed copy is "Daily lottery / You're entered". Footer buttons measure 52px (Paper 48px). The Rewards page, cash bonus and all Dance pages are api-dependency. |
| Rewards/SongEarnSheet | no-story | This is a new design with no component. Per-activity reward data is api-dependency. |
| Rewards/Streak | major (api-dependency) | The completion page has no week strip, because no week data exists. Only the legacy client reports a streak. There is no compact form, no community line and no streak leaderboard; the karaoke score leaderboard is a separate thing. |
| Rows/ReviewRows | minor | Measured: block padding 12px (Paper 14px) and inline padding 16px (Paper 20px). Typography matches. There is no shared component. Long-value wrapping is unverified. |
| Shell/AppShellChrome | major | The footer has 4 tabs plus a header bell (Notifications is api-dependency). The account row opens the picker, not the Profiles/Settings/Sign out menu that the owner ruled for. Settings is a card page, where Paper has a plain list with Telegram, Recordings, Terms and Privacy. Recordings copy differs. The footer measures 65px (Paper 64px). In the header story, content sits under the fixed header. |
| Shell/AppSidebar | minor | Geometry matches: 248px width, 16px padding, 40px link rows with r12, 44px community rows with 24px avatars. There is no Notifications link (api-dependency). Profile shows an avatar instead of a person icon, and the Anonymous story shows "H". Community avatars are grey and the second line is the handle; both are owner-decision. The layout animation is F3. |
| Songs/SongRow | major | The list row is a card with Study/Karaoke buttons, where Paper has a one-line row that opens the song sheet (owner-decision). Measured: title 18/28 (Paper 16/24), artist 16/24 (Paper 14/20), art radius 12 (Paper 8), initials where Paper has a note glyph. Progress and the moderation row are api-dependency. |
| States/StatusState | no-story | There is no StatusState component and none of the six states has a story. StatusCard is the nearest pattern and is slated for deletion (F20). Instances such as Winnings Held are plain text. |
| Verification/VerifySheet | no-story | The single sheet does not exist; there is a palm-scan page and a separate document modal. This was an agent choice (5) that the owner has not confirmed. |

Totals: 5 major, 2 minor, 4 no-story. Across all sheets the differences classify as 23 fixable, 13 api-dependency, 11 owner-decision, 4 missing-story, 4 unverified and 4 intentional (shared or recorded).

## Proposed fix slices (report only)

1. **Lottery wording**, in `src/features/rewards/megapot-participant.tsx`. Replace "Your Megapot share" and "share" copy with "Daily lottery / You're entered / Drawing on <date>…", which the owner confirmed on 2026-10-12. Closes part of ActivityResult. Risk is low, but the copy also appears on song detail and song card, so update those stories. The date depends on what the participant read returns.
2. **Account menu**, in `app-sidebar.tsx` and `media-shell.tsx` (plus the own-profile More sheet). The account row should open a menu: profiles with the current one ticked, Settings, Sign out. Owner ruling. Closes the AppShellChrome and AppSidebar items. Risk is medium, because this is live desktop chrome.
3. **Settings page as a plain list**, in `src/features/shell/account-page.tsx` and `recordings-settings.tsx`. Build it from settings rows (Telegram, Recordings, Terms, Privacy), with Recordings as its own page. Owner-approved. Risk is medium, because the live /settings route changes.
4. **PersonaSwitcherSheet restyle**, in `src/features/identity/persona-switcher-sheet/persona-switcher-sheet.tsx`. Use a one-line handle label, a 40px secondary avatar, rows in a card with radius-lg, a 24/30 title and the 20px sheet radius. Use a chevron or check by context, and stop showing the focus ring when the sheet opens. Grouping by community needs community names in the picker. The sheet is still under review, so confirm with the owner first. Risk is medium: it is used by the sidebar, the Profile tab and community posting, and RadioGroup changes (F9) touch it.
5. **Small measured fixes:**
   - Study/Karaoke result footer buttons 52px → 48px (`studying-surface.tsx`, karaoke equivalent).
   - Review row padding 12 → 14 (`boost-song-sheet.tsx`, `reward-sponsor-dialog.tsx`).
   - Mobile footer 65px → 64px (`mobile-footer-nav`), shared by every phone page, so low risk but wide reach.
   - AppShellChrome header story top inset.
   - Anonymous sidebar story fixture showing a profile initial.
6. **Your Songs row type and art** (`your-songs-page.tsx`): title 16/24, artist 14/20, art radius-md on secondary. Low risk. Changing the row's structure is an owner decision.

Owner decisions surfaced (none resolved):
- ActivityResult page split, checking states and repeat-action placement
- PayStep adoption
- SongRow structure
- StatusState adoption
- VerifySheet (agent choice 5)
- Sidebar coloured community avatars (agent choice 8)
- Account row second line

The three already-pending decisions (member Unfollow, visitor Profile button, reply loading) do not arise on these sheets.

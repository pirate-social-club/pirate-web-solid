# Patterns audit (group `patterns`), source 67d6b7a

Scope: 19 Patterns sheets against the design-system catalog (6132). The app catalog (6131) indexes the same story files, so it was not captured separately. Captures and side-by-sides are in `evidence/patterns/`. Measurement scripts are in `tools/patterns/`. Every sheet is "Later reference / use current repository component" in DESIGN-INDEX.

Verdicts: 4 match, 13 minor, 2 major, 0 no-story.

| Sheet | Verdict | Key differences |
| --- | --- | --- |
| Engagement/CommentPill | match | All measured values match: 44px, 23px icon, border-soft. |
| Engagement/CommunityAvatar | minor | The 24px size keeps 13.6px initials (Paper is about 9–10px). The image-variant fixture `/mascots/error-ghost-256.png` returns 404, so the fallback shows. |
| Engagement/VerticalFeed | minor | Stories show Like and a Follow badge that are not in Paper and not wired in the live app. The Mobile story's footer is a text placeholder. No Dance, reward pills, Boost or Report: all recorded as api-dependency. All board numbers (450x800, 16/16/8, 24/80, 14px labels) measured and matching. |
| Engagement/VotePill | minor | The Loading story (busy) shows plain arrows; Paper shows spinners. |
| Forms/CheckboxCard | match | 384x82, radius 12, padding 16, gap 12. |
| Forms/OptionCard | minor | The Default story selects Weekly, Paper selects Monthly. Otherwise matches. |
| Forms/CopyField | minor | No Copied story. The LongContent story is not width-constrained, so wrapping is not shown. Component specs match. |
| Forms/FormLayout | minor | No stories for the FormFieldLabel variants or the FormNote tones. Spacing of 6/6/24 matches. |
| Forms/FormattedTextarea | minor | The textarea has no horizontal inset (px-0; Paper insets 16px). This affects the live comment composer. The Mobile story overflows at 390 (480px wide). The Empty story never shows the placeholder. |
| Forms/ResponsiveOptionSelect | minor | The desktop trigger uses a down arrow (shared Select), not a chevron. The phone pill is not full width in the story. There are no open popup or sheet stories. Best/New/Top and the default selection are an owner decision. |
| Identity/PirateBrandMark | minor | The Default story is a 48px lockup with a wordmark; Paper's default is the bare 40px mark. Variant sizes are 32/48/64 against Paper's estimated 32/40/56. |
| Layout/ActionFooterShell | match | Footer 16/12/16 with a soft border and a 48px full-width button. |
| Layout/LayoutShell | **major** | The Sizes story collapses to 2px-wide containers. The Default card does not fill the 1024 container. CardShell is still exported, although owner ruling 1 says to delete it. |
| Navigation/FlatTabs | **major** | At desktop the tabs stretch to 624px each, against owner ruling 5. The actions slot and the "Options" pill still exist. The Tabs-underline story is still present; removing it is agent choice 7, an owner decision. |
| Navigation/MobileFooterNav | minor | Four tabs with no bell. This is a recorded difference (api-dependency). 64px row and active styling match. |
| Navigation/MobilePageHeader | match | 64px bar, 44px back/close, centred title, 16px insets. |
| Overlays/ActionMenu | minor | No open story. Extra trigger variants and row kinds are shown. Opening with a pointer draws the browser's white focus outline on the menu. The menu fill differs from the board's sample but follows the popover token (unverified). |
| Overlays/ConfirmDialog | minor | The stories use `destructive:false`, so Confirm is blue; Paper always uses destructive red. Geometry matches at 512 and 358. |
| Overlays/Modal | minor | The description is foreground colour (Paper uses muted). The phone sheet has a close X. Story copy reads "Maybe later" and a two-line description. About 16px of extra space sits under the description. |

## Proposed fix slices

1. **Story-only hygiene.** These changes carry no live risk:
   - VerticalFeed: drop `onLikeClick` and `onFollowClick` from the meta args, and render `MobileFooterNav` in the Mobile story.
   - VotePill Loading: show a pending direction.
   - OptionCard: select Monthly.
   - CopyField: add a Copied story and a constrained width.
   - FormLayout: add stories for the label variants and the note tones.
   - FormattedTextarea: give the Mobile story a constrained width, and add a placeholder state.
   - ResponsiveOptionSelect: make the phone pill full width, and add open stories.
   - PirateBrandMark: make the default the bare 40px mark, and set the variant sizes.
   - LayoutShell: use the `fullscreen`/`padded` layout.
   - ActionMenu: add an Open story.
   - ConfirmDialog: set `destructive: true`.
   - Modal: change the copy and set `hideCloseButtonOnMobile`.
   - Add the missing `/mascots` fixture, or point it at an existing asset. This also fixes the Item and IllustratedState stories.

   Closes most items on 12 sheets.
2. **FlatTabs ruling 5** (`flat-tabs.tsx`): make the desktop left-aligned, own-width tabs with 16px padding the component default, and remove the `actions` prop and its story. Check `src/features/community/page-shell/page-shell.tsx`, which already applies this at the call site, so the classes are not doubled. The risk is low to medium, because the community tab bar is live.
3. **FormattedTextarea inset** (`formatted-textarea.tsx`): add `px-4` to the textarea. It changes the live comment composer, which is its only caller. Low risk.
4. **Modal description** (`modal.tsx` ModalDescription): default to `text-muted-foreground`. Do not touch the shared `dialogDescriptionClass`, which ConfirmDialog also uses and which matches Paper there. Low risk.
5. **ConfirmDialog single look**: remove the `destructive` prop and always render destructive. There is one live caller, and it already passes `destructive`. Low risk.
6. **Shared components**: these also affect other sheets, so review them with the Components group.
   - Select trigger: use IconCaretDown instead of IconArrowDown. This also changes Components/Forms/Select.
   - Dropdown menu content: add `outline-none`.
   - Avatar xs: set a text size such as `text-[10px]`, or set it in CommunityAvatar only.
7. **Owner ruling 1**: delete `CardShell` from `layout-shell.tsx` once the stories stop using it.

These are not fixable in this repo and stay as classified:
- api-dependency: Dance, reward pills, Boost, Report, and the Notifications tab.
- owner-decision: the sort options and default, and removing the Tabs component.
- unverified: video playback (no H.264 in headless Chromium), the board's ActionMenu fill against the popover token, the MobileFooterNav profile glyph, and the sidebar CommunityAvatar (not on this sheet).

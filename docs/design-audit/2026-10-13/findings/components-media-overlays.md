# components-media-overlays — Paper vs Storybook (67d6b7a)

Captures were taken at 1280, and also at 390 for AlertDialog, Dialog, Sheet and Toast. Each overlay was opened with Playwright after the story's play() had finished. Motion was sampled every animation frame (rAF) after the open action. Evidence is in `evidence/components-media-overlays/` (`sbs-*.png`, `measure.json`). The scripts are in `tools/components-media-overlays/`.

| Sheet | Verdict | Key differences |
|---|---|---|
| Media/MediaControlButton | minor | The Default and Variants stories render at 32px, not Paper's 40px, because render() ignores the args. Shadow token. |
| Media/Scrubber | minor | Under the centered layout the stories collapse: the Default card is 146px wide and the Variants/Disabled tracks are 0px wide. The component itself matches. |
| Media/Waveform | minor | The story cards are 256px wide, so the 72 bars render at 1px instead of 2px. |
| Overlays/AlertDialog | minor | The destructive state has no story. The component shows the close X by default (the story hides it). Shadow token. Blur not verified. |
| Overlays/Dialog | minor | The Default story adds a description that Paper does not draw. Shadow token. Blur not verified. |
| Overlays/DropdownMenu | **major** | **The Delete item is clipped and pointer users cannot reach it** (max-h-96 with overflow-hidden; scrollH 427 vs clientH 382). The browser focus outline shows on the menu. Shadow-md token. |
| Overlays/Sheet | **major** | A close X that Paper does not draw. The side-sheet grid stretches its rows, so the body sits at y=346 instead of under the description. The description wraps because of the 56px space kept for the X. Shadow token. |
| Overlays/Toast | match | Everything measured matches. Only 3 toasts can be visible at once (Kobalte limit). Paper states no limit, so this is a note only. |
| Overlays/Tooltip | minor | Opens below the trigger instead of above it. 0px gap, because `gutter` is set on Content rather than on the root. Shadow-md token. |

**Motion (checked in the browser):** Dialog, AlertDialog, DropdownMenu, Tooltip and Toast all appear with no animation: full opacity in the first sampled frame, no transform, no running animations. This matches the Motion board. Sheets slide in from their own edge (X for left/right, Y for top/bottom), take about 300ms, and follow an ease-out curve that fits cubic-bezier(0.22,1,0.36,1). This matches the board. Sheets close instantly with no exit slide. Paper only specifies the enter, so this is a note; the `data-closed:translate-*` transition classes in sheet.tsx never take effect.

**Cross-cutting (new):** `shadow-sm/md/lg/xl` utilities resolve to Tailwind's default shadows. The repo and Paper values (`--shadow-*` in styles/tokens.css, matching Foundations/Radius-Elevation: xl is 0 24px 80px /18%, md is 0 12px 30px /8%) are never mapped into `@theme`. Only Toast, which uses `shadow-[var(--shadow-lg)]`, gets the token value.

## Proposed fix slices
1. **Shadow tokens.** Add `--shadow-sm/md/lg/xl: var(--shadow-*)` to the `@theme` block in `packages/solid-ui/src/index.css`. This closes the shadow item on 7 sheets. Risk: it changes elevation on every `shadow-*` use across the app (the values are subtle on a dark ground). Check light-theme screens.
2. **DropdownMenu content.** In `components/overlays/dropdown-menu/dropdown-menu.tsx`, change `overflow-hidden` to `overflow-y-auto`, or remove the max-h-96 cap, and add `outline-none`. Closes DropdownMenu. Risk: low. It also applies to ActionMenu, the community sort/more menus and the content overflow menu. community-more-menu already adds outline-none locally.
3. **Sheet layout.** In `components/overlays/sheet/sheet.tsx`, use `content-start`/`grid-rows-[auto_auto_1fr_auto]` or a flex column for the side variants, so the footer's `mt-auto` pins it to the bottom. In the stories, pass `hideCloseButton`, or decide whether the X stays. That fixes the description wrap. Risk: medium, since 10 app files use SheetContent. Check sheets that have long scrolling bodies.
4. **Tooltip.** In `components/overlays/tooltip/tooltip.tsx`, move `gutter` to the root (or wrap the root with default `placement="top"` and a gutter). Closes Tooltip. Risk: low, 3 app call sites.
5. **Story-only fixes, no app risk:**
   - MediaControlButton: spread args or use `size="md"` in Default/Variants.
   - Scrubber and Waveform: give the stories a width (`w-[36rem]`/`w-full`) or `layout: "padded"`.
   - Dialog Default: drop the description, or record this as an accepted difference.
   - AlertDialog: add a `Destructive` story.
   - Optional: make AlertDialogContent default to no close button.

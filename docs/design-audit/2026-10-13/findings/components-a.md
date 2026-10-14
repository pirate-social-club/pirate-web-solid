# components-a: Actions, Data Display, Disclosure, Feedback (source 67d6b7a)

I compared 13 sheets against the design-system Storybook (port 6132) at 1280 wide, dark scheme. I also checked 390 wide for the responsive stories. To measure the boards, I segmented the board PNG pixels. The boards are drawn at 1x, and every box size matched the browser to within 1px. Storybook values come from getComputedStyle and getBoundingClientRect. I forced hover states in the browser.
Evidence: `evidence/components-a/` holds one side-by-side per sheet (`sbs-*.png`), the stacked story captures (`stack-*.png`), the hover crops, the 390 captures, and `measure-1280.json` / `measure-390.json`. Tools are in `tools/components-a/`.

The three known foundation findings (overline, unpaired motion, sidebar layout animation) did not show up on these sheets. The Accordion caret, Spinner, Skeleton and Avatar skeleton all pair their animation with motion-reduce.

| Sheet | Verdict | Key differences |
| --- | --- | --- |
| Actions/Button | minor | The icon-size loading button shows a spinner plus the "+" child, where Paper shows the spinner only. There is no Hover story; the forced-hover fills match the board. |
| Actions/Chip | match | All sizes and variants are pixel-equal. |
| Actions/IconButton | minor | The Destructive swatch uses an X icon where Paper uses a check. The first swatch is blue on the board but secondary in Storybook. The board's own caption says the default is secondary, so this one is unverified and needs the designer to say which is meant. |
| Actions/PillButton | minor | There is no Hover story; the forced hover matches the board. |
| Data Display/Avatar | minor | The Sizes story shows "J" because it passes `fallback="JD"`; Paper shows "JD". The image variants 404, which matches the board's own note. |
| Data Display/BadgedCircle | major (story only) | The first Variants item is missing its subject circle and leaves an orphan "5" badge. The cause is a shared Solid JSX node that gets moved into the second item. |
| Data Display/Card | minor | The Default story also renders a CardDescription line, making the card 244px tall against Paper's 198px. Unverified whether Paper dropped it on purpose. |
| Data Display/FormattedText | minor | Paper draws the bare URL as a link; Storybook renders it as plain text (owner decision: autolinking user content). The long-content column is 480px where Paper says 320px. At 390 the story overflows (scrollWidth 512). |
| Data Display/Item | minor | The image media tile shows a broken-image glyph and alt text, because of a 404 asset and no error fallback. Paper shows a plain tile. |
| Data Display/Separator | match | No differences. |
| Disclosure/Accordion | minor | The story copy reads "What is Pirate?…"; Paper reads "What is a community?…". The Multiple capture shows one section open only because its play function collapses the first section. |
| Feedback/Skeleton | minor | The Default block is 1216px wide in the story; Paper shows 320px. |
| Feedback/Spinner | match | No differences. |

Totals: 3 match, 9 minor, 1 major. None are api-dependency. One owner-decision (bare-URL autolinking), two unverified (IconButton first swatch, Card description), two missing-story (Button hover, PillButton hover).

## Proposed fix slices

1. **Story-only parity pass.** No risk to live app screens: these are stories only.
   - `badged-circle.stories.tsx`: make `subject` a function so each BadgedCircle gets its own node. Closes BadgedCircle.
   - `avatar.stories.tsx`: Sizes uses `fallback="Jane Doe"`. Closes Avatar.
   - `accordion.stories.tsx`: change the copy to "What is a community?" and update the play-function queries. Closes the Accordion copy difference.
   - `icon-button.stories.tsx`: use IconCheck on the Destructive swatch.
   - `skeleton.stories.tsx`: make the Default block `w-80`.
   - `formatted-text.stories.tsx`: make the long-content column 320px.
   - `button.stories.tsx` and `pill-button.stories.tsx`: add Hover stories (pseudo-state or a forced class). Closes the two missing-story items.
2. **Item image fallback.** Change `item.stories.tsx` to an asset that exists, or give `ItemMedia` an image `onError` fallback in `item.tsx`. The `item.tsx` route has low to medium risk because Item is shared by list rows, but it only changes the failed-image path.
3. **Button icon loading.** In `button.tsx`, hide the children when `loading && size === "icon"`. Low risk: grep finds no non-story `size="icon"` used together with `loading`; IconButton already renders the spinner alone.
4. **Not proposed:**
   - Bare-URL autolinking in `formatted-text.tsx` changes how live user posts render and needs a product decision.
   - The IconButton first swatch and the Card description need designer confirmation.
   - Separate hygiene item: `text-success-foreground`, which the BadgedCircle stories and tests use, has no token. The board records this, so it is not a parity gap.

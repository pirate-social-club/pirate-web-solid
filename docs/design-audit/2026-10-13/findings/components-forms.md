# components-forms: Paper vs Storybook (source 67d6b7a, DS catalog :6132)

Captured at 1280 (MultiCombobox also at 390), dark scheme. Listboxes were opened with Playwright clicks. Measurements come from getComputedStyle and getBoundingClientRect. Evidence is in `evidence/components-forms/` (`sbs-<Sheet>.png`, `open-*.png`, `focus-*.png`, `dump-1280.json`). Tools are in `tools/components-forms/`.

Verdicts: 7 match, 5 minor, 3 major. 0 no-story. 3 missing-story entries: AutoResizeTextarea Grown/Capped, Combobox Open, Select Open.

| Sheet | Verdict | Key differences |
|---|---|---|
| AutoResizeTextarea | major | Textarea recipe is lost. The element only has `min-h-0 resize-none`, so it has no border, radius, padding or bg and shows the browser focus outline. Grown and Capped stories are missing. |
| Checkbox | match | 24px, radius 12, 8px gap, tokens all match. Default story adds a label. |
| Combobox | minor | No Open story. Listbox gap is 8px; Paper has 4px. Default story shows the selected value, not the placeholder. |
| EditableNumberInput | match | Same as Input. |
| Input | minor | Flat variant keeps 16px horizontal padding because size `px-4` overrides flat `px-0`. |
| InputOTP | minor | Component matches (58px tall cells, 8px gap, 2px primary focus). The Filled story stretches to full width, and the Default story focuses cell 3. |
| Label | match | 16/20 w500. Observation only: ruling 10 says "never label a field optional", but board and story use "Optional" as the muted example. |
| MultiCombobox | major | Chips are full pills; the board's design change says medium radius. The Mobile story overflows at 390 (scrollWidth 416). The caret wraps to the left of row 2. The placeholder shows beside the chips. The With-chips play leaves 1 chip. The listbox gap is 8px instead of 4px. |
| PrefixInput | match | 48/56px heights, 48px prefix column. |
| RadioGroup | major | Items stack vertically (`grid` with no columns) instead of the horizontal segmented row. Description and error render inside the tinted track. |
| RadioIndicator | match | 24px, 2px ring, 12px dot, 12px label gap. |
| Select | minor | No Open story. Listbox gap is 8px; Paper has 4px. Default story shows the selected value with focus. |
| Switch | match | 48x28 track and 20px thumb. Default story renders on, labelled and focused. |
| TextField | match | 6px gap, destructive-text error. |
| Textarea | minor | Flat keeps 12px vertical padding. The resize grip is visible. The Long-content story scrolls at 112px; the board shows the box grown. |

Known foundation finding, not new: transitions without a motion-reduce pairing appear in checkbox, combobox, multi-combobox, input, input-otp, prefix-input, radio-group, radio-indicator, select, switch (thumb) and textarea. None of the forms files contain `motion-reduce`. No overline usage was found on these components.

## Proposed fix slices (report only)

1. **Textarea class merge** (`forms/textarea/textarea.tsx`, `forms/auto-resize-textarea/auto-resize-textarea.tsx`). Closes AutoResizeTextarea. First confirm why `omit` leaves `class` in `rest` when props arrive merged. Spreading `{...rest}` before `class` would fix it, and Input has the same pattern. Risk: low. App screens pass `class` straight to `<Textarea>`, and those render styled. Add Grown and Capped stories.
2. **Flat variants** (`forms/input/input.tsx`, `forms/textarea/textarea.tsx`). Move the flat padding reset so it wins over size (a compound variant, or `!px-0` for flat), and add `py-0` to textarea flat. Optionally add `resize-none` (or `resize-y` hidden) to the textarea default. Closes the Input and Textarea flat findings. Risk: medium. Check `variant="flat"` callers in `src/` (post composer write-step uses its own class overrides).
3. **RadioGroup layout** (`forms/radio-group/radio-group.tsx` and stories). Add a horizontal segmented layout keyed on Kobalte `orientation="horizontal"` (`data-[orientation=horizontal]:grid-flow-col auto-cols-fr`). Move the track styling to an inner wrapper so Description and ErrorMessage sit outside it with a 6px gap. Risk: medium. `persona-switcher-sheet.tsx` uses RadioGroup as a vertical list and overrides the root class, so keep vertical as the default and re-check that sheet.
4. **MultiCombobox field** (`forms/combobox/multi-combobox.tsx` and stories). Pass a medium-radius class to the Chip here (the Chip sheet is unchanged). Keep the caret at the end with `ms-auto` or put the input and caret in their own row group. Hide the placeholder when there are selections. In stories, use `w-full max-w-80`, a 358px mobile wrapper, and don't remove a chip in play (or add a separate interaction story). Risk: low. Check app usages of MultiCombobox before changing it.
5. **Popover offset** (`select.tsx`, `combobox.tsx`, `multi-combobox.tsx`). Set Kobalte `gutter={4}` to match Paper's 4px. Risk: low. This affects every live Select/Combobox popover by 4px.
6. **Stories only** (combobox, select, switch, checkbox, input-otp stories). Add Open stories for Select and Combobox (`defaultOpen` or a play click), put Default stories back to the board's resting state, and give InputOTP Filled the 390px wrapper. Risk: none to the app.

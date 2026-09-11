# Wizard and phased-surface headings

Multi-step forms in this product keep one convention: the step indicator
is navigation, and each step's content carries its own heading.

The post composer is the only labeled multi-step flow today. Its step
indicator is a `nav aria-label="Steps"` of buttons with
`aria-current="step"`. That announces where the author is, but a nav is
not a heading, so each step renders its name from the same `copy.steps`
source as an `h2` inside the step content — Song, Lyrics, Rights, Review.
Subsection headings nest under that step heading; the rights allocation
`h3` was the surface's only heading before this, with no parent.

Phased single-surface flows do not need per-phase headings. Very keeps a
persistent `h1` and adds `h2`s only for distinct terminal phases
("Community joined", "Verification complete"); ZKPassport keeps its `h1`
while the phases are sequential prompts into the same surface. A future
wizard adopts the composer rule: persistent surface heading, navigation
indicator, and one heading per step named from the step's own copy.

Do not substitute the step indicator's `aria-current` state for a
heading, and do not give a step a heading whose name differs from the
step indicator's name for that step.

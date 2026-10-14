# Foundations (source 67d6b7a) and signed-out More placement

Evidence: foundations/measured.json (browser-resolved tokens and Type variants, DS catalog, 1280, dark),
token-diff.txt (static), motion-unpaired.txt (106 transitions without motion-reduce),
evidence/signed-out/ (audit-only story in a detached worktree; never committed).

| Sheet | Verdict | Findings |
| --- | --- | --- |
| Foundations/Color | match | All 29 colour tokens resolve to Paper values; card-hover (color-mix) = L 0.305, primary-subtle = L 0.232 C 0.020 h 263 — within rounding of Paper's literals. |
| Foundations/Typography | minor | 9 of 10 Type variants match size/leading/weight/tracking. F1 overline renders 16/24, Paper 16/20 (measured) — fixable, `components/data-display/type/type.tsx` (add leading-5). Font family: intentional (board: "Inter stands in for the system font stack"). |
| Foundations/Spacing & Sizing | match (code) | Button sm/default/lg = 36/44/48, icon 44, header 4rem, gutters 1rem/1.25rem/2rem. Tailwind 4px scale. Not browser-measured beyond Type. |
| Foundations/Radius & Elevation | match (code) | Radius scale and 4 shadows identical; Button and Input use radius-lg as the board requires. |
| Foundations/Motion | minor | Sheet 300ms cubic-bezier(0.22,1,0.36,1), accordion 200ms ease-out, button spinner 0.9s match. F2: 106 transition utilities (DS+app) lack motion-reduce pairing — board says every animated utility is paired (fixable, mechanical). F3: sidebar animates layout (transition-[width], [left,right,width], [width,height,padding], transition-all) — board says never layout (fixable; sidebar.tsx, sidebar.primitives.tsx). |

Signed-out phone More (PR #60 fix 9be9252), real MediaShell + HomeVideoFeed at 390:
Sign in 294,14 84x36; More 330,68 56x56; header 0..64; no overlap; 18px gap; sheet rows ["Unmute"]; no page errors.
Observation (unverified on real media): unfilled white dots are faint over a bright frame below the header scrim.

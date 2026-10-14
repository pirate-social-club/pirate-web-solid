> **Note (2026-10-14):** this is the brief the 2026-10-13 auditors followed. Its absolute paths point to a scratch directory that no longer exists. `$H` is `docs/design-handoff/2026-10-12/` on branch `origin/handoff/paper-storybook-20261012`. Start from `HANDOFF.md`.

# Sheet audit brief (read-only)

You are auditing Paper design sheets against the Storybook of pirate-web-solid at source commit 67d6b7a87ba1da2756b26cfa30b32a82bb1510bc (checkout: /home/user/pirate-web-solid — READ ONLY: never edit, stage, commit or push anything there; never run git commands that change state).

Audit directory (write everything here): AUD=/tmp/claude-0/-home-user/01a6ad78-3889-55b5-95db-19e6c3536236/scratchpad/audit-rest
Paper handoff: H=/tmp/claude-0/-home-user/01a6ad78-3889-55b5-95db-19e6c3536236/scratchpad/handoff/docs/design-handoff/2026-10-12
- Boards: $H/boards/<Sheet-path-with-dashes>.png (e.g. Components/Data Display/Avatar -> Components-Data-Display-Avatar.png). View them with the Read tool (it shows images).
- Some sheets also have state PNGs in $H/states/ and JSX in $H/reference/jsx/<name>.jsx.txt (exact Paper copy and classes) — check $H/DESIGN-INDEX.csv for each sheet's files and its dependency_or_limit note.
- Authority docs (rulings, specs): $H/authority/. Paper rulings override older docs. tokens: $H/reference/tokens.css.
- Paper is dark theme. Paper's Typography board says Inter stands in for the system font stack: font family differences are INTENTIONAL, never report them.

Static Storybook servers (already running, serve the frozen build):
- Design-system catalog: http://127.0.0.1:6132 (index: $AUD/ds-index.json)
- App catalog: http://127.0.0.1:6131 (index: $AUD/app-index.json)
Capture: `cd /home/user/pirate-web-solid && SB=http://127.0.0.1:6132 node $AUD/tools/cap.mjs <outDir> <storyId>:<width> ...` (dark scheme, full page; errors logged to <outDir>/capture-log.jsonl).
Side-by-side: `python3 -I $AUD/tools/sbs.py out.png "Paper" board.png "Storybook" capture.png`.
For measurements write small Playwright scripts under $AUD/tools/<your-group>/ modelled on $AUD/tools/cap.mjs (import playwright from /home/user/pirate-web-solid/node_modules/playwright/index.mjs, executablePath /opt/pw-browsers/chromium) and use getComputedStyle / getBoundingClientRect. Use Node from /tmp/claude-0/-home-user/01a6ad78-3889-55b5-95db-19e6c3536236/scratchpad/node24/current/bin if needed.

Method, per sheet:
1. Read the board (and state PNGs / JSX if any). List every variant, size, state and numeric spec it shows.
2. Find the matching Storybook stories (search the index by title) and the component source. A name match does NOT establish parity — compare what is rendered.
3. Capture the relevant stories at 1280 (and 390 where the sheet shows phone or the component is responsive). Put captures in $AUD/evidence/<group>/ and make a side-by-side per sheet.
4. Compare: variants/states present or missing, sizes, radius, colours (token), typography, spacing, icons, copy. Measure numbers in the browser wherever the board states a number or the difference is not obvious. Mark each difference measured=true only if you measured it in the browser; visual-only judgments are measured=false.
5. Classify each difference as exactly one of:
   - fixable — frontend change in this repo can close it;
   - api-dependency — needs an api-next contract that does not exist;
   - owner-decision — needs a product decision (do NOT resolve it; three already pending elsewhere: member Unfollow, visitor Profile button, reply loading);
   - intentional — documented reason (Paper ruling, a11y, recorded difference), cite it;
   - unverified — could not check (say why).
   Also report "missing-story" when the board shows a state with no story.

Output (required):
- $AUD/findings/<group>.jsonl — one JSON object per sheet:
  {"sheet":"Components/Actions/Button","paper_ref":["boards/...png", ...],"stories":["components-actions-button--default", ...],"source_commit":"67d6b7a","viewports":[1280],"states_checked":["default","hover?"...],"verdict":"match|minor|major|no-story","differences":[{"what":"...","paper":"...","storybook":"...","measured":true,"class":"fixable","files":["packages/solid-ui/src/..."],"evidence":"evidence/<group>/..."}],"evidence":["evidence/<group>/sbs-....png"],"notes":"..."}
- $AUD/findings/<group>.md — a short human summary: table of sheet | verdict | key differences, then proposed small fix slices (which files, which sheets each closes, risk to live app screens since solid-ui components are shared).
Be precise and conservative: do not claim parity you did not check; do not invent Paper values that the board does not show. Report only, implement nothing. Keep your final reply to a brief summary (counts per verdict, top 5 differences, paths written).

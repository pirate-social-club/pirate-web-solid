# Flows/Screens group B (`flows-b-screens`), source 67d6b7a

Scope: 10 "Later reference" sheets and 112 numbered states, compared against the app catalog (6131).

How the comparison was done:
- 146 stories were captured at 390 and at 1280, using `tools/flows-b-screens/capt2.mjs`. This is cap2.mjs, which waits for `sb-show-main`. It also writes the page's innerText, which was diffed against the Paper JSX copy.
- An earlier capture pass at a fixed wait produced several blank captures. Every capture was redone with cap2. The page text from the redo was byte-identical to the text from the first pass, so no finding relied on a blank capture.
- No story showed `errordisplay`.
- Three play functions fail when a story is captured at a width it was not written for: Management Shell `queue-first-desktop` and `mobile` at 390, and `mobile-index` at 1280. These are story-width artefacts, not product defects.
- Some captures are still near-uniform after the redo. These stories show a spinner or render nothing: `*-route--loading`, `leaderboard-loading`, and `parts-wallet-winnings--rewards-unavailable`.

Files:
- Measurements: `evidence/flows-b-screens/meas.json`.
- Paper copy per frame: `evidence/flows-b-screens/jsxtext/`.
- Side-by-sides: `evidence/flows-b-screens/sbs/`.

Paper export notes:
- Three Paper state PNGs are 1x1 exports and could not be compared: Claim 123, Send 112 and Portfolio 200.
- Most of these sheets are marked "Under review, not yet approved". Where a caption calls a design change unapproved, the difference is classed as owner-decision. Where a caption says the change was made "per the workspace_owner", it is classed as fixable.

Verdicts: 0 match, 0 minor, 7 major, 3 no-story.

| Sheet | Verdict | States → stories | Key differences |
| --- | --- | --- | --- |
| Flows/Dance/Take | no-story | 9 drawn, 0 stories | **Blocked dependency.** Blocked by Spec 021 amendment items A–F, ratification and independent review. The DanceJourney story was removed in PR #60. Nothing is proposed. |
| Flows/Karaoke/Practice | major | 8 mapped, 9 missing | Missing stories: the recording notice, mic blocked, no mic, playback interrupted, streak, no-entry result, the leave confirm, and the desktop mic-blocked and interrupted states. The code already has the exact mic strings.<br>The button reads "Start karaoke" and then "Start singing"; Paper reads "Start".<br>The exit is a caret; Paper uses a close mark.<br>The current lyric line is weight 600; Paper is 700 (measured).<br>Copy for the notice, interrupted and refused states is longer than Paper's (owner-decision; Spec 019 §5.1 review).<br>The result page adds stats and "Sing again".<br>The reward and streak pages are api-dependency. |
| Flows/Rewards/Boost | major | 7 mapped, 1 missing (unavailable) | The app has one "Create a bounty" form; Paper has three steps (unapproved, so owner-decision).<br>Fixable: the copy names Pirate ("Pirate buys and holds the tickets"), against the owner's copy rule.<br>Label differences: "Megapot ticket" vs "Lottery", and "People earn by … Either" vs "Earned by" checkboxes.<br>The app has a persona picker and a max ticket price field; Paper has neither.<br>The dialog is 576 wide; Paper is 440 (measured). The Review button is below the fold.<br>Reward data is api-dependency. |
| Flows/Studying/Session | major | 13 mapped, 4 missing | The owner-ruled changes are not built:<br>• the close mark instead of the caret<br>• "You said:" instead of "We heard:"<br>• dropping the "comes back later" line and the diff<br>• a Correct/Incorrect box for multiple choice<br>• correct answers advance by themselves<br>• a wrong multiple-choice answer waits for "Continue"; the app shows "Try again".<br>The desktop column is 720 wide and its footer 768; Paper is 640 (measured).<br>The fixture uses "Translate:".<br>The streak and no-entry states are api-dependency. |
| Flows/Wallet/Claim | major | 3 partial, 5 missing, 1 unverifiable PNG | The claim is a row inside an asset with "Verify to claim". Paper has Rewards cards and per-win rows.<br>The claim and palm-scan confirmation sheets are missing (desktop dialogs too).<br>The state copy differs, and the app has no Paid, recipient_pending or failed_retrying states.<br>Claiming is offered only in Testnet (api-dependency). |
| Flows/Wallet/Send | no-story | 0 of 9 | The send sheet exists, but no story passes `renderSendSheet`.<br>The palm gate is not in the API: `sponsored-send` has no verification requirement (api-dependency). |
| Screens/Community/Management | major | 13 mapped, 6 missing | Sections: the app shows Names and Content policy; Paper shows Handles and AI moderation. Paper also has Profile, Rules and Links, which have no write API.<br>The queue uses inline action cards; Paper uses Dances/Reports lists and a report detail. The Dance queue is blocked.<br>The app has 13 policy categories; Paper has 6 (owner-decision).<br>The Telegram and Assistant pages are long forms that say "in Pirate".<br>Variants:<br>• owner: the default stories<br>• moderator: the view-only stories, which show the raw "moderation.act capability" text<br>• non-owner: `ownersettingsroute--denied`, which Paper does not draw. |
| Screens/Shell/Notifications | no-story | 0 of 4 | The app has a four-tab footer and `/activity` is a placeholder. The contract needed is listed in the JSONL `contract_needed` field:<br>• a list read with kind, created_at, read_at and target<br>• an unread flag<br>• mark-read<br>• a cursor.<br>api-next has no notification contract. Three of the five row kinds depend on Dance. |
| Screens/Songs/YourSongs | major | 2 mapped, 3 missing (sheet ×2, desktop modal) | The card has Study and Karaoke buttons and no streak. Paper's card is a tappable song with a flame count.<br>The subtitle and the "Recent activity" heading are extra (measured).<br>The streak list read and the reward pills are api-dependency.<br>The signed-out, empty and unavailable stories exist; Paper does not draw them. |
| Screens/Wallet/Portfolio | major | 4 mapped, 4 missing, 1 unverifiable | Header: the app has a "Switch profile" button and a "Your wallets" list; Paper has a profile pill.<br>The balance reads "—" with no Send; the Royalties/Rewards cards and Activity are missing (api-dependency).<br>Assets are grouped by network; Paper has a flat list with $ values.<br>Receive: the app truncates the address and defaults to Ethereum; Paper defaults to Base. On desktop it is a 384 side sheet; Paper uses a 480 dialog (measured).<br>The column is 672 wide; Paper is 640 (measured).<br>The network switch is always shown (owner-decision). |

Shared components (attributed, not re-reported):
- F4: shadows on the bounty dialog.
- F6: the side-sheet close X on desktop Receive.
- Patterns: MobileFooterNav four tabs (api-dependency).

## Proposed fix slices (frontend only)

1. **Study owner-ruled changes**:
   - Files: `studying-surface.tsx`, `activity-progress-header.tsx`, `studying-surface.stories.tsx`.
   - Changes:
     - a close mark
     - "You said:"
     - drop the "comes back later" line and the diff
     - a result box for multiple choice
     - correct answers auto-advance
     - an incorrect answer shows Continue
     - a 640 desktop column
     - the fixture question.
   - Closes most of Studying.
   - Risk: medium. These are live Study screens, and ActivityProgressHeader is shared with Karaoke, so the close mark changes Karaoke too. Confirm the owner wants Karaoke's close mark before shipping.
2. **Story coverage, no live risk**:
   - Karaoke: stories for mic blocked, no mic, interrupted, the recording notice and Correct (say it back).
   - Wallet: Portfolio stories that pass `renderSendSheet`, for details, review and sent.
   - Management: stories for a report detail.
   - Closes the missing-story rows on Karaoke, Studying and Send.
3. **Copy owner-rule pass**:
   - `reward-funding-panel.tsx`: no "Pirate".
   - Telegram and Assistant settings: "open in the app".
   - `wallet-hub.tsx`: "Receive USDC".
   - Moderation view-only text: no raw capability name.
   - Low risk; these are live strings.
4. **Wallet layout**:
   - Files: `wallet-portfolio.tsx`, `wallet-hub.tsx`, `wallet-receive-sheet.tsx`.
   - Changes:
     - the profile pill switcher
     - the flat asset list with a Refresh text action
     - a 640 column
     - the full address
     - Base as the default chain.
   - Medium risk: the live Wallet. The cards, $ values and Activity wait on API data.
5. **Management labels and order** (`community-management-shell.tsx`):
   - Handles, AI moderation and Safety.
   - Rows without descriptions.
   - A queue count.
   - Low to medium risk. The Profile, Rules and Links rows wait for write commands.
6. **YourSongs card** (`your-songs-page.tsx`):
   - Remove the extra heading and subtitle.
   - The card opens a sheet.
   - Gate the streak on a new read.
   - The sheet is under review, so confirm with the owner first.

Not fixable in this repo:
- Dance: all 9 states, plus the Dance queue rows in Management. Blocked.
- Notifications contract.
- Song streak list, and the week marks for streaks.
- Reward data and pills, which are fixture-only.
- Palm-gated send enforcement.
- Mainnet Send and Claim.
- Fiat values.
- Write APIs for Profile, Rules and Links.

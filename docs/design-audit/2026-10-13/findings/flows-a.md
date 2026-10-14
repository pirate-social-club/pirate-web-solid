# Flows audit (group `flows-a`), source 67d6b7a

Scope: 7 Flows sheets against the app catalog (6131). The captures, the side-by-sides and the driven-state screenshots are in `evidence/flows-a/`. The scripts are in `tools/flows-a/`: `cap2.mjs` waits for the play function to finish and records the result, `drive.mjs` drives a story with Playwright, `meas.mjs` takes measurements, and `copycheck.py` checks copy against the JSX.

Every sheet in this group is marked "Later reference / Use current repository component; no first-slice change" in DESIGN-INDEX. Every fixable item below is therefore later-slice work.

Verdicts: 1 minor (SignIn) and 6 major. None match, and none has no story.

| Sheet | Verdict | Key differences |
| --- | --- | --- |
| Auth/SignIn | minor | Copy matches exactly. **Measured:** the desktop dialog is 512 wide with radius 14 and padding 32; Paper is 440 wide with radius 16 and padding 16/20/20. The error line is 16px; Paper is 14px. A close button is visible and enabled while signing in, but Paper says the dialog cannot be closed then. The phone close X is F18/F6. The spinner is grey; Paper's is blue. |
| Community/Address | major | The sheet is "Under review". Handshake has only its start card as a story ("Prepare your records / Start verification"); Paper's group 1 is "Connect a Handshake name / Get the records". Groups 1–11 have no state stories after the start card. Spaces address copy differs throughout ("Connect a space" against "Community address"). The Connected card lacks the Link, Last checked and Member names rows. "That didn't connect" has no story. The register's Proposed and Candidate items are api-dependency. |
| Community/Create | major | Storybook has 2 pages (join policy inline); Paper has 3. The pseudonymity intro and the "Checked with…" card lines are missing. The forward button reads "Continue", not "Next". The avatar is an upload card whose title truncates at 390, not Paper's circle. **Measured:** the name-required field keeps its normal border and has no aria-invalid. The profile page has a close X at top right. On desktop the page fills the window, not a 544 card. Choosing an existing profile in the route conflicts with "no choice here" (owner-decision). |
| Community/JoinAndName | major | Every string says "name" where Paper says "handle" (`routes.json communityJoinName.*`). State 056 still shows the old "unfinished" state, which Paper replaces with "issued, page not opening". The "Joined this Community." toast covers the phone sheet's hint. **Measured:** the desktop dialog is 448 wide with radius 14, padding 32 and a 20px title; Paper is 440 wide with radius 16, padding 24/20/20 and an 18px title. The scrim has `backdrop-blur-sm`. These states have no stories: not eligible, already have one, ran out, checking, all Spaces naming sheets, and the desktop long-value dialogs. |
| Posts/Song | major | Ruling 12 is not met: the phone has no step title, and the forward control is an arrow icon at top right, not a labelled footer Next. On desktop, "Create a post" with Cancel and footer Back/Continue break ruling 11. "Lyrics (optional)" breaks ruling 10. Uploading is an inline card, not a centred state. Royalties shows "All earnings go to you / + Add". After Post, the composer returns to the feed; ruling 14 asks for a centred state on the page. Instrumental/Vocals, the match check on step one and wallet collaborators are api-dependency. The Matched-vs-name-the-original rule is owner-decision. |
| Posts/Text | major | The field reads "Title (optional)"; ruling 10 says Title is required with an asterisk. On phone there is no "New post" title and the arrow icon replaces the footer Post. On desktop, "Create a post" plus Cancel replaces the close X and "New post". |
| Posts/Video | major | Everything that differs is in the sheet's own "not yet approved" list: tap a row then Next, a Start step with a bracket, camera time and Flip, and Next/Post wording. These are owner-decision, as are the desktop webcam cards and the post-publish destination. Review (146) and Uploading (147) are unverified because there is no H.264 encoder here. |

## Shared-component observations (new, not in SHARED.md)

These are proposed for SHARED.md. Neither is re-reported per sheet beyond attribution.

- **Overlay scrim blur.** `dialog-presentation.tsx` and `sheet/sheet.tsx` use `bg-black/55 backdrop-blur-sm`, which measured at 8px blur. The Paper flow frames show the page behind a #0000008C scrim and sharp. This resolves the "blur not verified" notes in components-media-overlays.
- **FormNote / Type `caption` is 16/20.** Both flows that draw it want 14/20: SignIn errors and the JoinAndName hint. The hint already renders 14/20, so the 16px is specific to FormNote (`text-base`) used as an error line. Measured.

Attributed rather than re-reported: the phone sheet close X (F18/F6) and the textarea resize grip (F10).

## Play functions that fail here for reasons other than H.264

These were recorded as unverified in CI:

- `screens-community-communitypage-posting--full-width-composer-on-mobile`, `--mobile-composer-inside-the-app-shell` and `--song-composer-in-main-on-mobile` all fail on `expected 0 > 0` (window scrollY). They also fail at 320x568.
- `--song-upload-progress` fails at 390 because there is no "Song" heading on phone. It passes at 1280.

The H.264 failures were `review-playback`, `upload-progress`, `review-posting-as` and `desktop-review`.

## Proposed fix slices

1. **JoinAndName copy: handle not name** (`src/locales/en/routes.json` `communityJoinName.*`). This is copy only, plus the locale test. Low risk: only the join sheet uses these keys. It closes most of the JoinAndName copy items.
2. **Sheet-local dialog sizing.** Use `sm:max-w-[440px]`, radius 16 and Paper padding in `src/features/auth/sign-in-modal.tsx` and `src/features/communities/community-join-name/community-join-name.tsx`. In both, hide the close button while signing in or issuing. Low risk: the classes are local and the shared Modal is not touched.
3. **Composer page structure (rulings 10, 11 and 12)** in `src/features/posts/post-composer/*` and `text-submission`:
   - header title plus a close or back at top left;
   - a labelled footer forward button on phone;
   - drop "Create a post", Cancel and the separate Back;
   - Title required, and remove "(optional)".
   This closes most of Text, plus the Song header, footer and labels. Medium risk: it changes the live community-page composer, and the posting stories assert the current bar structure.
4. **Song after-Post state (ruling 14)** and the **centred Uploading state.** Medium risk: it changes live community-page posting.
5. **Create flow restructure** (`create-community.tsx`, `join-policy-field.tsx`, `media-picker.tsx`):
   - make join policy its own page, with the intro and the "Checked with…" lines;
   - Next/Next/Create;
   - an avatar circle with a camera badge;
   - name-required `aria-invalid` and a destructive border.
   Low to medium risk: the route is gated, per the story docs.
6. **JoinAndName 056 state.** In `community-name-controller.ts`, show an issued handle whose page is not opening as issued, with Check the page. Medium risk because it is controller logic. Separately, move or suppress the "Joined this Community." toast while the sheet is open (`community-engagement-controller.ts`).
7. **Shared scrim blur and FormNote size.** Remove `backdrop-blur-sm` in `dialog-presentation.tsx` and `sheet.tsx`, and set `text-sm` for FormNote. Medium risk: this affects every Dialog, Sheet and Modal and every FormNote caller. Review it with the overlays and forms groups.
8. **Story coverage.** Add stories for:
   - the JoinAndName sheet-alone states and Spaces naming;
   - Spaces "That didn't connect";
   - the Handshake address states that the register marks Built.
   This is story-only, with no live risk.

These are not fixable in this repo and stay as classified:
- **api-dependency:** stem uploads, the match check on step one, wallet collaborators, the Spaces Connected and names-terms rows, and the Address register's Proposed and Candidate states.
- **owner-decision:** all the Video "not yet approved" changes, Matched against name-the-original, the Create existing-profile choice, and the SignIn real marks.

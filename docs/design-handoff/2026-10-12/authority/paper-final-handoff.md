# Paper design pass, final handoff, 2026-10-12

This is the closing handoff for the design pass on the Paper file "Pirate
Design System". It is not a task record and assigns nothing. Dispatch and lane
state belong to `tasks/records/` in the canonical workspace.

The pass was design only. Nothing was built, tested, or exercised in a browser,
a wallet or on a chain. Checks were screenshots of the Paper sheets and reading
of the app and API source. Wallet and chain verification, and the naming gaps in
`handoffs/naming-implementation-gaps-2026-10-11/`, are outside design
acceptance.

The pass was steered by review documents relayed by the workspace_owner from a
second session. Those reviews are not recorded owner rulings. Where this handoff
says "proposed", no one has approved the behaviour.

## Current state and remaining work

This section is the one current list, written late on 2026-10-12. It supersedes
every "not drawn", "to draw" and "remaining" list in the dated sections below,
which are kept as the record of how the pass went.

Decisions made by the workspace_owner on 2026-10-12, late, in chat. These close
the list that stood here.

Moderated Dance is part of launch ("yes i think we need dancing as part of
launch"). So the moderation queue, stored take results, pass and fail events,
notifications and equal rewards for private takes are required launch work.

The four navigation placements are approved ("what you're saying seems
reasonable"): the phone account menu opens from More on your own profile and
keeps Share; Settings is a plain page reached from that menu and the desktop
account menu; the song leaderboard opens from a Leaderboard label beside the
song streak; the community streak and a Leaderboard action sit above the
community feed.

"Show publicly if it passes" is on by default ("public by default, better for
the site/platform growth"). The reviewer and the design agent had recommended
off.

Replies stay one level deep for now. The workspace_owner did not answer whether
a reply keeps a Reply button, so the drawing stays as it is, with no button on
replies; that remains the design agent's choice.

Royalties will need a palm scan too, but are not relevant until paid songs or
dances exist ("we don't have royalties involved yet"). Nothing is to be built or
drawn for royalties now.

The four working defaults are accepted ("not sure what these are but sound
reasonable"): whole selected-profile wallet on community domains, below-target
attempts do not count toward the streak, a dance counts for the day it was sent
once it passes, old deep replies are flattened. Treat as accepted without close
reading, not as carefully worded rulings.

The move of the visibility switch to Review was never worded as approved, though
the answer on its default assumes it; it is treated as settled.

The four approved placements are drawn. The phone account menu and the Settings
page are on `Parts/Shell/AppShellChrome`; Settings holds Telegram, Recordings,
Terms and Privacy, following the app's account page. Recordings has its page and
its delete confirmation drawn, because Study and Karaoke send people to Settings
to delete their recordings; its failure and partial results are described and
not drawn.
Both leaderboard entries are on `Parts/Rewards/Streak`, and the community line
is also drawn in place on the member's phone screen of
`Screens/Community/CommunityPage`. The leaderboard has its own phone page on
the Streak sheet, and the song's Leaderboard action is drawn in place on the
three-activity sheet of `Screens/Songs/YourSongs`. Left over from these:
Settings on desktop, and the leaderboard and both entries on desktop.

The route into Dance from a song already existed and needed no drawing: the
song's sheet in Your songs has a Dance row beside Study and Karaoke, and the
rewards sheet opened from a post's pill has the same row. The Dance sheet's
caption now says so. Both song sheets on `Screens/Songs/YourSongs`, three
activities and Karaoke only, carry the Leaderboard line.

Result route, ruled by the workspace_owner on 2026-10-12 ("i'm saying yes"):
the dancer's latest attempt status is shown privately on the dance's own page,
alongside Notifications, and both open the same result. This keeps the
2026-09-30 ruling and adds the result page to it. Drawn on `Flows/Dance/Take`,
last group: a "Your take" row above the button with In review, Passed, Not
passed and Not reviewed. While a take is in review the page has no Do this
dance button: the workspace_owner found a second submission odd there, and
Spec 021 section 5.1 allows one active session per account, dance and revision,
so another attempt at that same dance is blocked for up to seven days. Other
dances are unaffected. Tapping In review opens Submitted; the other three states
open their result. The button is back once the take is answered or expires,
settled by the direction below. All four states are drawn in place: in review
without the button, and passed, not passed and not reviewed with it. Not drawn:
the row on desktop.

Direction from the workspace_owner, 2026-10-12: build Dance assuming an AI check
that comes back quickly later; repeated attempts at the same dance are the
long-term flow to prepare for; and people may do the dance daily to be eligible
for that day's reward or lottery. So the owner's review is the first version of
a flow meant to become fast, and "Do this dance" and "Try again" stay as the way
to repeat. A repeat pass in the same
drawing adds no second entry; a pass on a later day can qualify for that day.

Rules that conflict with daily participation, for the coordinator; none is
settled here. The one-active-session rule (Spec 021 section 5.1: one per
account, dance and revision) blocks another attempt at the same dance for up to
seven days under owner review, so several waiting takes of the same dance and
revision cannot exist today. A dance joins the lottery of the day it passes. Using the day it
was sent is not a ready fix: Spec 015 freezes a drawing's participants before
purchase, so a qualification that arrives after the cutoff cannot join that
closed drawing. Submission-day streak credit and lottery entry need separate
treatment. Quick AI checks serve the daily goal; seven-day owner review does not
reliably give same-day eligibility, and no screen may promise a short wait at
launch. A repeat on a later day can earn that drawing's entry when eligible;
nothing implies the cash bonus repeats daily.

Withdrawal is a missing flow carried forward from the 2026-09-30 draft, which
has `withdrawn` as a state; it is not a new idea. Drawn as proposed on
`Parts/Rewards/ActivityResult`, on the reviewer's recommended placement: a quiet
"Withdraw take" under Done on the waiting Submitted page, and a confirmation
sheet. Nothing changes until the server confirms the withdrawal; only then does
the Your take row leave the dance's page and Do this dance return. A confirmed
failure keeps the take in review, with retry. An unknown outcome is a separate
state: the server may have withdrawn the take while the response was lost, so
another attempt stays unavailable while the app reads the authoritative status
or replays the same withdrawal idempotently, and then shows whatever the server
confirms: withdrawn, still pending, or already answered. A verdict or expiry
that wins the race shows that result. Removing the row after a confirmed withdrawal
is the design agent's choice: the server keeps the withdrawn take as a terminal
record, and the page must not surface an older take as the latest. Not drawn:
the message when the answer arrives first, a confirmed failure with retry, the
unknown-outcome state, and
the action on the flow's own Submitted copies and on desktop. The placement
awaits the workspace_owner's approval. The coordinator must settle its race with a verdict or expiry, and
a withdrawal must never reopen a take that already has an answer.

Drawings still missing, with no decision needed. On the post page: a video post,
writing a reply, a long thread, a removed comment, loading, no comments yet, a
post that is gone. On the profile: desktop Edit, several handles, an empty cover
on Edit, saving and a failed save, loading, empty, a profile that is gone. On
Notifications: the empty page on desktop, the not-reviewed row on desktop,
loading, a failed read, and any kind of row beyond dance and video answers. On the Wallet: loading and error. In Management: empty lists. On the
activity results: the Rewards page for someone already entered who earned a cash
reward, a place to check a lottery entry later, claiming a cash reward, a second
line for the community streak, and desktop. On Send: the scan-complete state for Send is drawn on desktop
only; the phone version is not drawn. On Dance: changing a take's
visibility after sending, a dancer who is not a member, and empty states. The
owner's review queue is already drawn on `Screens/Community/Management` (the
Dances list and its Pass and Fail screen, phone and desktop); what it lacks is
an access-denied state for someone who is not the owner, and a dance nearing
its seven days. There is no moderator-only view to draw: at launch only the
owner sees or acts on Dances and Reports. On the Streak sheet: both leaderboard entries on desktop, the
leaderboard page on desktop, and its empty, loading and failed states.

Accepted omissions, carried by the phone drawings and not planned for desktop:
Study listening, checking, correct and multiple choice; Karaoke ready, recording
notice, starting and no microphone; Create with palm scan chosen and the empty
nationality field; the short waiting dialogs in JoinAndName. The feed copies
that sit behind sheets on flow pages show song and text posts only, which the
reviewer accepted.

Described and not drawn, by earlier choice: a palm code inside the Claim dialog.

Not re-viewed after later changes: Address groups other than 2, 3, 5 and 10
against the StatusState page-card form; the Spaces funding terms rows; the post
page's reward pill; the result copies on `Flows/Studying/Session` and
`Flows/Karaoke/Practice` after the lottery wording changed.

Design choices of the design agent that follow a ruling but were not themselves
ruled: dropping the Archive page; removing the Reply button from reply rows; no
list or history of dance takes anywhere; the routing after the Study and Karaoke
Result.

Future work, not for now. Royalties: when paid songs or dances exist, the
royalty claim will need a palm scan like every other claim, its screens will
need drawing, and Spec 015 section 5.2a will need amending. Nothing is to be
drawn or built for royalties until then, per the workspace_owner.

For the coordinator: reconcile, do not duplicate. Three planned task records
already cover part of this and predate today's decisions:
`tasks/records/api-dance-moderator-verdict.md`,
`tasks/records/dance-moderator-verdict-amendment.md` and
`tasks/records/rewards-activity-ui.md`. The design agent has not edited them.

The Dance amendment record lists workspace_owner rulings of 2026-09-30. The
amendment must be ratified before implementation starts; its record says so.
How each ruling stands against today's design:

- Who reviews: the owner of the dance's community, since there is no moderator
  role. Carried forward. The sheets now say "owner", not "moderator".
- Review window: seven days from upload, and every ending is final, with no
  later review and no restore. Carried forward. A "Not reviewed" ending is drawn
  on `Parts/Rewards/ActivityResult`; it says plainly that it is not a fail. Try
  again there, as on Not passed, starts a new attempt and never reopens the old
  take.
- Publication. Then: passing does not control publication, and the dancer picks
  post only, submit for review, or both. Now: one switch, on by default, and a
  take is shown only after a pass. Re-decided by the workspace_owner on
  2026-10-09 and 2026-10-12; the older records need updating to match.
- Result route. Settled on 2026-10-12: both. The latest attempt's state on the
  dance's page, as ruled on 09-30, and a notification, each opening the same
  result page. The 09-30 "no verdict screen" is superseded to that extent, and
  the amendment record needs updating to match.
- Rewards. A pass being a qualification and not a payout does not conflict with
  the passed page, which has a no-reward variant and separates being entered
  from winning. What is unresolved is eligibility, and the restriction is
  explicit: item 11 of the draft
  (`handoffs/SPEC-021-MODERATOR-VERDICT-AMENDMENT-DRAFT-2026-09-30.md`, line 110)
  says an owner-reviewed pass can satisfy only rewards funded by that community
  or the song's owner, never platform-funded pools. The Dance pages draw the
  daily lottery, so that promise is not build-ready until the coordinator
  resolves whether the lottery shown is community- or song-owner-funded. Item 10
  also requires the dancer's human verification before a pass can satisfy a
  reward. It does not require a palm scan before filming or submitting. The
  coordinator needs to settle when verification is asked for and what a passed,
  unverified dancer sees; no such state is drawn, and the passed page should not
  be read as promising a reward merely because a take passed.

App work, as well as server work, required by the launch plan: Dance capture,
submission, the visibility choice, the reviewer's queue and the result screens;
the Notifications page, unread state, links to results and the fifth phone tab;
the revised activity-result sequence and streak displays; the account menu,
Settings routing with recording deletion kept as it is, and reply behaviour.

Not built, and outside design acceptance. Notifications (no contract, endpoint
or stored rows). Dance moderation, pass and fail events, and equal rewards for
private takes. Cross-activity streaks, daily marks and the newly-earned signal.
The palm-scan check on Send, and a Send purpose and return on
the verification page, so that a scan started from Send comes back to Send
details on the sending profile. One-level replies and newest-first comments on the
server. Both leaderboard reads in the app.

## Design coverage

Sheets are named Tier/Area/Name. Each sheet's caption states its rules, and a
dashed outline marks a proposed screen.

Shared masters, on the Parts page, each with variants, rules and the instances
checked:

- `Parts/Rows/ReviewRows`: read-only review rows and settings rows.
- `Parts/Rewards/RewardPill`: the pill on a song post that opens the rewards
  sheet.
- `Parts/Songs/SongRow`: the song list row, the post tile and the moderation
  row, kept as three rows.
- `Parts/Rewards/Streak`: compact, completion and week strip.
- `Parts/States/StatusState`: six states (waiting, uncertain, held,
  recoverable, failed, done) in a block form and a page-card form.
- `Parts/Shell/AppShellChrome`: which pages get the sidebar, header and footer.

Flows, each with phone screens and a desktop group:

- `Flows/Auth/SignIn`: five states; desktop is a 440 dialog.
- `Flows/Community/Create`: details, join policy, profile, name error; desktop
  is a 544 card.
- `Flows/Community/JoinAndName`: Handshake handles and Spaces names. Desktop
  draws twenty dialogs, including the longest names, the uncertain and recovery
  states, the access errors, the receiving wallet's email and code steps and the
  profile choice. Every dialog has a close mark that leaves a request running.
- `Flows/Community/Address`: Handshake groups 1 to 11, Spaces groups 12 and 13,
  a state register (14), and phone layouts (15, 16).
- `Flows/Posts/Text`, `Flows/Posts/Song`, `Flows/Posts/Video`,
  `Flows/Dance/Take`, `Flows/Rewards/Boost`: phone and desktop, drawn before
  this pass's final rounds and not redrawn in them.
- `Flows/Studying/Session` and `Flows/Karaoke/Practice`: desktop fills the
  window with no sidebar. Drawn on desktop: Study ready, a missed answer, and
  the result, streak and rewards screens; Karaoke singing, microphone blocked,
  playback stopped, and music that won't play.
- `Flows/Wallet/Send`: details, review, sent; desktop is a 480 dialog.
- `Flows/Wallet/Claim`: claim with a current palm check, claim needing a check,
  the verification page and its seven states, several wins, and the rows after
  claiming.

Screens touched: `Screens/Wallet/Portfolio` (per profile, phone and desktop,
Receive, refresh states, staging-only network switch),
`Screens/Community/Management` (all sections, phone and desktop),
`Screens/Profiles/Profile` and `Screens/Posts/Post` (desktop added).

Not drawn on desktop and carried by the phone drawings: Study listening,
checking, correct and multiple choice; Karaoke ready, recording notice, starting
and no microphone; Create with palm scan chosen and the empty nationality field;
the short waiting dialogs in JoinAndName. Also not drawn: Wallet loading and
error, desktop profile Edit, the video post page, and empty lists in Management.

Not re-viewed after the last changes: Address groups other than 2, 3, 5 and 10
against the StatusState page-card form; the Spaces funding terms rows; the post
page's reward pill.

## Proposed behaviour

These are drawn or described in Paper and differ from what the app does today.

- Wallet refresh keeps the previous balances on screen while it runs and after
  a failure. Today `wallet-balances.ts` replaces every amount with "Loading…".
- The Mainnet and Testnet switch is hidden from members. Today the app shows it,
  and offers Send and claims only in Testnet mode, so this needs both working on
  Mainnet first.
- The verification page uses new wording for its states, and adds "Back to
  Wallet" on the dismissed and unavailable states. The app's messages say
  "ceremony".
- A palm code inside the Claim dialog is described but not drawn. The built
  flow leaves for the verification route and resumes the claim on return.
- The Spaces naming sheet checks for an existing request before showing the
  name field, and the "we can't tell if your request went in" state. Both depend
  on the member recovery work in the naming gaps brief.
- Management pages for Profile, Rules and Links, and the rule and link
  editors. There are no write routes for them in the contracts. Archive was
  drawn as a proposed page and removed on 2026-10-12; see the rulings below.
- Dance rows in the moderation queue show the dancer's handle.
- The post card's video kind and reward pill. The app's card handles text and
  song and has a Boost button instead.
- The Spaces failure heading is "Your request did not complete", which says only
  what the app knows.

## Implementation gaps

- Scan return does not restore the earning profile. `wallet-winnings.tsx`
  resumes the credit after a palm scan and filters by whichever profile is
  showing. That may already be the right one; when it is not, nothing switches
  to the profile that earned the win, so the result can be hidden.
- Streak data. The API stores song and community streaks per account. The
  current Study screen passes no streak fields, the contracts carry no seven
  daily marks, and nothing reports that a completion is the one that made today
  count. The streak screen is dashed for this reason.
- Moderation queue data. `community-moderation-runtime.ts` covers text posts,
  comments and replies with `author_persona_id`. It has no dance queue and no
  public handle.
- No reward pill exists on posts in the app.
- Spec 014 §6.1 describes a portfolio added up across profiles. The app and
  Paper are per profile; the spec should be brought into line.
- Tabs. Paper draws five phone tabs including Notifications; `shell-model.ts`
  has four.
- Naming: see `handoffs/naming-implementation-gaps-2026-10-11/` for Spaces
  owner progress, Spaces member recovery, and the Handshake handle and address
  repairs, with its two unresolved items. The third, the renewal-warning
  threshold, was closed by the ruling below.

## Owner rulings, 2026-10-12

The workspace_owner answered the open decisions in chat on 2026-10-12, after
this handoff was first written. A relayed review then corrected parts of the
account, and those corrections are folded in here.

- The desktop sidebar's account row shows the current profile and opens one
  menu: switch profile, Settings, sign out.
- Profiles cannot be followed. Only communities can.
- A handle cannot be replaced once issued, for now.
- Replies are one level under a comment, comments newest first and replies
  oldest first, for now.
- There is no renewal warning for a community's Handshake name. Renewal is the
  owner's responsibility.
- Study, Karaoke and Dance all contribute to one shared streak.
- Streaks and leaderboards should work per song and per community.
- A member cannot claim, or send money out of the wallet, before a palm scan.
- Reward wording was already ruled on 2026-10-09 and is unchanged: the pooled
  pill reads "$1M lottery" with the live jackpot. See
  `handoffs/paper-design-rulings-2026-10-09/README.md`, item 7. A member's
  entitlement is a share in a pool; "ticket" stays correct for what the pool
  buys.

One item is the design agent's choice and not a ruling. The owner said to do
whatever is easiest on the existing API for Archive. The API has no community
archive, so the Archive page is dropped from Management. That does not settle
what archiving would mean.

The rulings add implementation work, listed here apart from the design that is
done:

- Shared streak. `recordQualificationProjections` in
  `activity-qualification-repository.ts` accepts only Study and Karaoke
  qualifications. Dance is reserved in the activity registry and not wired.
- Streak leaderboards. The API has song and community streak leaderboard
  endpoints in `rewards-qualification.ts`. The app calls neither. They are
  separate from the Karaoke score leaderboard the app already has.
- Palm scan before Send. `wallet-sponsored-send-handlers.ts` has no palm check,
  and the relayed review found none in the service, repository or database
  guard. A scan screen alone would not enforce the rule; the API must refuse an
  unverified send. This is a source finding, not a demonstrated live bypass.

## Working defaults, 2026-10-12

These were open. The reviewer and the design agent recommended the same
answer for each, and the workspace_owner then said to continue. That is not a
worded ruling, so they are recorded as working defaults and can be reversed.

- The Wallet on a community's own host is the whole wallet of the profile in
  use, the same as everywhere else.
- An attempt that finishes below the target does not count toward the streak.
- A dance counts for the day it was sent, once it passes. A waiting take earns
  nothing yet, and passing fills in the original day.
- Existing replies deeper than one level are flattened under their top comment,
  keeping their text, author and a "replying to" line.

Where the palm scan appears for Claim stays as built: the separate verification
page. The requirement is the scan, wherever it appears.

## Paper changes made from the rulings, 2026-10-12

Applied: the Archive section and page are removed from
`Screens/Community/Management`, phone and desktop. The renewal warning card and
its register entry are removed from `Flows/Community/Address`, and group 10 now
covers two lapses. `Flows/Wallet/Send` gains a dashed palm-check step on phone
and desktop. The captions of those three sheets and of `Parts/Rewards/Streak`
record the rulings and what is not built.

Drawn in a second round the same day: the account menu, on
`Parts/Shell/AppShellChrome`; one streak leaderboard, dashed, on
`Parts/Rewards/Streak`, which serves both the song and the community list. The
open-question notes for profile follow, handle replacement and reply order are
replaced by the rulings on their sheets. Karaoke already had a phone streak
screen after a take. Dance gets a note and no screen, because its result comes
later, when a moderator passes it. As a working default, not an owner ruling, a
dance counts for the day it was sent, once it passes. The streak writer has no
Dance path, and the lottery's own rule does not settle the day.

Still not drawn: where each leaderboard opens from, the community streak's own
place on a community page, the account menu on a phone, a Settings page, and a
flattened reply with its "replying to" line.

The reply ruling is more than a drawing change. Eight levels of replies are
allowed today by the app, by the contract (`comment-thread.ts`, depth 0 to 8)
and by the server's submission checks, so the limit has to change in all
three. The API also returns root comments oldest first
(`comment-thread-repository.ts` orders by creation time ascending), and the
ruling is newest first. As a working default, not an owner ruling, existing
threads deeper than one level are flattened under their top comment.

The working defaults are written into the captions of `Screens/Wallet/Portfolio`,
`Parts/Shell/AppShellChrome`, `Parts/Rewards/Streak`, `Flows/Dance/Take` and
`Screens/Posts/Post`. The footer drawn on `Parts/Shell/AppShellChrome` now has
four tabs. The Notifications tab was then removed from every five-item phone
footer found: 23 on the Screens page, 13 on the Flows page (eight on
`Flows/Community/JoinAndName`, five on `Flows/Auth/SignIn`) and one on
`Parts/Identity/YourProfiles`. Footers were found by a style search, so one
built differently could have been missed. The Storybook mirror pages were not
touched. The header bell is not drawn.

## Notifications and Dance results, 2026-10-12

Drawn: the bell in the phone header, on `Parts/Shell/AppShellChrome`, and three
take statuses (in review, passed, didn't pass) on `Flows/Dance/Take`, dashed.
A take's status stays with the take; a notification only points to it. Passed
states the lottery share, for the day it passed, and the streak day, for the
day it was sent.

Implementation gaps. The app's shell has a header bell with an unread count,
and hides it when a page uses that corner, as the Wallet does. Its Notifications
page reads "Notifications are unavailable". No notifications contract or
endpoint was found in the API. There is no dance moderation queue, so there is
no pass or fail event and no take status to show.

Open: whether Dance is in launch scope. If it is, take status in the app is
part of the flow and cannot be left out. Push and Telegram delivery are left
for later either way, as the reviewer recommended; the workspace_owner has not
ruled on this. Also not drawn: where a person's takes are listed.

## Fifth tab restored, 2026-10-12

The four-tab working default is withdrawn. The workspace_owner expected
Notifications in the footer and asked why it had gone, and the reviewer
withdrew the recommendation. The phone footer is five tabs again: Home, Your
Songs, Wallet, Notifications, Profile. The earlier passages in this handoff
that describe four tabs, the removal from 37 footers and the header bell
describe that reversed change. The header bell drawing is removed. The app's
shell has four tabs and a header bell, so it needs the fifth tab added. The
tab is back as the fourth item on 38 footers: 23 on the Screens page, 13 on
the Flows page and two on the Parts page. Each bell is the design system's own
glyph, copied from the mirror sheet `Patterns/Navigation/MobileFooterNav`, and
the `Parts/Identity/YourProfiles` footer has its unread dot again. That mirror
sheet already drew five tabs and was never changed. Checked by screenshot: the
shell master, one Screens footer, one SignIn footer and YourProfiles; the other
34 were swapped by the same operation and not viewed one by one. Whether any
footer other than YourProfiles carried a dot before the removal is inferred
from the deleted items' structure, not confirmed. One footer, inside a hidden
frame on the Wallet's Receive screen, stays hidden as it was.

The sidebar account row now shows the profile in use on all 14 copies found,
including the master `Parts/Shell/AppSidebar`: the handle, with the community
under it as the design agent's choice. One was checked by screenshot. The
captions that mentioned the older row are updated. `Parts/Shell/AppSidebar`
was checked: it carries no open-question note, both signed-in sidebars show
the new row, and its caption now describes the row and points to the menu. Two
footers have an unread dot, each with evidence of having had one:
`Parts/Identity/YourProfiles`, and the Home screen on
`Screens/Shell/Notifications`, whose caption says the dot is drawn there. No
other footer has one.

## Correction: the Notifications sheet already existed, 2026-10-12

`Screens/Shell/Notifications` was drawn before this pass and the design agent
did not read it before removing the tab or before saying the Notifications
page was undrawn. It is under review and not approved. It draws the fifth tab
with its dot on Home, the tab filled on the list page, the list on phone and
desktop, and four rows: a dance that passed, a dance that did not, and two
failed videos. Its caption says each row opens what it is about, and a dance
answer opens the result page, `Parts/Rewards/ActivityResult`. So the fifth tab
and a persistent destination for a dance result were both already in Paper.

After the restore, that sheet's list-page footer showed the bell inactive. It
is filled again, using the bell-fill path from the app's own icon package,
`@phosphor-icons/core` 2.1.1, in the foreground colour. The three take-status
rows added to `Flows/Dance/Take` overlap with that sheet's result page and
have not been reconciled with it.

## Dance result reconciled with the Notifications sheet, 2026-10-12

A relayed review found the Dance result incomplete and the Notifications
caption stale. These changes follow the reviewer's recommendation; none is a
workspace_owner ruling.

`Parts/Rewards/ActivityResult` now draws three Dance states: submitted, passed
and not passed. Each names the song and the day the take was sent. Passed shows
what was earned, as the cards the Study and Karaoke rewards page uses, and one
line giving the day that counts toward the streak. Dates are written out and
"today" is not used, so a reopened result still reads true.

The three take rows on `Flows/Dance/Take` are relabelled as a private list of
the dancer's own takes on their profile. A row and its notification open the
same result page. The passed row no longer says "today's lottery".

The captions on `Screens/Shell/Notifications`, `Parts/Rewards/ActivityResult`
and `Flows/Dance/Take` were brought into line. The Notifications caption now
says the navigation masters have five destinations and lists both footers that
carry the unread dot.

Checked by screenshot only. Not drawn: where the takes list sits on the profile,
a passed dance that earned nothing, and desktop. Not built: everything here.
Whether moderated Dance is in launch scope is still undecided.

A second relayed review the same day corrected two things in that round. The
submitted Dance result still read "Today's pool is $1,042,318", so the statement
above that "today" was not used was wrong when written; the amount is now
removed and the row gives the rule only. The Notifications caption named the
YourProfiles sheet under the wrong page; it now reads
`Parts/Identity/YourProfiles`.

On the reviewer's recommendation the passed Dance lottery card reads "Share
confirmed" with the drawing date, in place of "1 entry". The Study and Karaoke
pages on the same sheet still say "1 entry" and "No lottery entry this time."
The two should agree, and which word wins is an open question for the
workspace_owner; it is noted in the sheet's caption.

A third relayed review extended the share wording to Study and Karaoke, again
as a recommendation and not a workspace_owner ruling. Every rewards card now
reads "Share confirmed" with the drawing date, and the no-reward line reads
"No lottery reward from this attempt." The line for a repeat qualification,
"Your share is already confirmed for this drawing.", is written in the sheet's
caption and not drawn. The caption's earlier argument for "entry" is withdrawn
there. The long captions on `Flows/Studying/Session` and
`Flows/Karaoke/Practice` still use the phrase "no lottery entry was earned" in
prose; their group labels and screens are updated.

The workspace_owner questioned the Public switch on the submitted Dance page
the same day (a switch followed by Done reads as if Done posts). Not resolved.

The Public switch was then moved, on the reviewer's and the design agent's
recommendation; the workspace_owner raised the problem but did not word an
approval, so the move is proposed. On `Flows/Dance/Take`, phone and desktop,
Review now carries the switch "Show publicly if it passes", the line "Passing
earns the same rewards whether your take is public or private.", and the button
"Submit for review". The Submitted pages there and on
`Parts/Rewards/ActivityResult` have no switch and say "If it passes, this take
will appear publicly." The switch stays drawn on; the default is a separate open
question. The private variant of the Submitted line is not drawn. Equal rewards
for a private take is intended behaviour and must be enforced when Dance is
built.

While doing this I found the two Submitted copies on the flow sheet had not
received the earlier corrections: both still showed the pool amount and neither
named the song. Both are fixed. The flow's song is "Harbor Lights", so the
Submitted copies and the take rows on that sheet now use that name; the master
on the result sheet keeps its own sample song.

The workspace_owner rejected "Share confirmed" the same day as not coherent
English, and read "share" as sharing the take publicly. Every lottery card now
reads "You're in" with the drawing date; the repeat line is "You're already in
the 11 Oct drawing." "You're in" is the design agent's replacement and awaits
confirmation. The word "share" is no longer used on the result pages.

The workspace_owner then rejected "You're in" as well ("average people still
don't understand that"). The lottery card now reads "Daily lottery", "You're
entered", and "Drawing on 11 October. If the ticket wins, you get part of the
prize." This follows the reviewer's proposal, fitted to the card's three lines
by the design agent, and awaits the workspace_owner's confirmation.

The workspace_owner then said of the "You're entered" card "it's good", which
confirms that wording, and called the pending row's copy verbose. The lottery
row on all three Submitted pages now reads only "If the ticket wins, you get
part of the prize." The rule that a dance joins the drawing of the day it passes
is no longer on the page; it remains in the captions.

## Your takes on the profile, 2026-10-12

Drawn on the reviewer's recommendation; proposed, not a workspace_owner ruling.
On `Screens/Profiles/Profile` the phone screen of your own profile has a second
button, Your takes, beside Edit, and a new group draws the page it opens: a
private list of every dance take the person has sent, each row giving the song,
the status and the day sent. A row opens the result page that a notification
also opens. It is a button because the profile has no tabs.

Not drawn: the button on a profile with no handle, desktop, an empty list, and
the tap from a notification row to the result. The three dashed rows on
`Flows/Dance/Take` remain as the earlier sketch and say more than the new rows.
How long a notification is kept, and whether it can be dismissed, is not
specified anywhere; an earlier statement of mine that a missed notification
makes the result unreachable was not established. Checked by screenshot only.

## Your takes removed, 2026-10-12 (workspace_owner ruling)

The workspace_owner rejected the profile placement: "this is not really a
profile matter, it's a backend thing", and "only the actual videos of the dance
like a normal post would go to the feed, it shouldn't be a button there". This
supersedes the section above and every earlier mention of a takes list.

Removed from Paper: the Your takes button and page on
`Screens/Profiles/Profile`, and the three sketched take rows on
`Flows/Dance/Take`. No list or history of takes is designed anywhere. The
dancer's route to a result is Notifications to the Dance result page. The server
keeps each take's status, visibility choice and rewards. A passed, public take
appears as an ordinary video post. The captions on the profile, Dance and result
sheets say this.

The workspace_owner then asked for the dance video to be shown in the profile
feed, so every post kind is visible, and said the community feed and the profile
feed are effectively the same component. The first phone screen on
`Screens/Profiles/Profile` now shows a song post, a video post and a text post,
the video being a copy of the video card on `Parts/Posts/PostCard` with no
caption line. The other profile screens, desktop, and the community feed were
not changed or checked for the video kind. The master video card still carries
a body line ("First take of the chorus."), which sits oddly with the 10-09
ruling that videos have no captions; not changed.

## Video card made consistent across feeds, 2026-10-12

Follows the workspace_owner's instruction that feeds reuse the same components.
The caption line was removed from the master video card on
`Parts/Posts/PostCard` and from the video card in the desktop community feed.
The video card was added to both phone community feeds on
`Screens/Community/CommunityPage` and to the remaining profile screens on
`Screens/Profiles/Profile` (no handle, someone else's, desktop). Feeds and the
phone community screens were set to grow with their content.

Correction to the section "Your takes removed": the workspace_owner ruled that
submission tracking does not go on the profile and that only real dance videos
appear in a feed. "No list or history of takes anywhere" is the design's present
choice, not a ruling; a history inside the Dance flow was not ruled out and is
not designed. The Dance and result captions now say this.

Not changed: about two dozen other feed copies that sit behind sheets on flow
pages still show song and text only. A list item on
`Screens/Community/Management` still names a post by the removed caption text
"First take of the chorus." Checked by screenshot only.

## Result variants and flattened reply, 2026-10-12

On the reviewer's recommended order. `Parts/Rewards/ActivityResult` now also
draws the Submitted page for a private take, a passed dance that carried no
reward, and two more endings of the Study and Karaoke result: already entered
from an earlier attempt, and the lottery result still loading ("Checking the
lottery…"). The group label states which notification row opens which Dance
result. `Screens/Posts/Post` has a new group drawing a flattened reply with its
"Replying to" line. The list item on `Screens/Community/Management` that named a
video by its removed caption now reads "Harbor Lights · Video". Checked by
screenshot only.

## Result routing and reply buttons corrected, 2026-10-12

After a relayed review. "Checking the lottery…" is now drawn as a waiting state
of the Result with Continue held, placed second in the sequence, not as an
ending; the result caption states the routing, including that "already entered"
ends the flow only when no new streak day or cash reward remains to show. The
Reply button was removed from every reply row on `Screens/Posts/Post` (phone,
visitor, desktop and the flattened-reply group), since a one-level thread gives
it nowhere to lead; that is the design agent's choice. The Notifications to
result connection is written in the result sheet's group label and caption only;
the Notifications sheet's own group labels are unchanged. The remaining-work
section near the top was completed with the items the first version dropped.

## Lottery wait exit and comment order, 2026-10-12

After a relayed review. The lottery waiting state of the Result now has a close
mark, and a new state follows it for a check that failed or took too long:
"Couldn't check the lottery. Any reward shows in your Wallet." with Try again
and Done. The caption states that leaving loses nothing because the server
records what was earned. That a lottery entry is visible in the Wallet is
assumed from the rule that earnings show there; where it appears is not drawn,
and how long counts as too long is not set.

The comment examples on `Screens/Posts/Post` (phone member, phone visitor,
desktop) were reordered newest first, each top comment moving with its replies.
Checked by screenshot: the result sequence and the desktop comments.

Correction the same day: the failed-check line promised more than was verified.
The Wallet shows winnings, not entries. The line now reads "Couldn't check the
lottery. Try again." Try again repeats the status check and never resubmits the
activity. The app's status reader already aborts after 15 seconds
(`src/features/rewards/megapot-participant.tsx`, lines 50 and 117 at the
canonical Solid checkout), which is the reference for the timeout. Where a
person checks a lottery entry after leaving is unresolved and listed above.

## Owner review of the sheets, 2026-10-12

The workspace_owner looked through the sheets and gave these directly.

Study. The workspace_owner's words: "our study shows a continue button - this is
wrong, if right, it just goes to the next exercise. incorrect should pause so
they can see what's wrong." Incorrect pausing is plainly ruled; correct going on
by itself with no Continue is the design agent's reading of the first half. The Continue footer was removed from the two correct screens on
`Flows/Studying/Session`. How long Correct stays up is not set. The "You said"
line now sits full width under Incorrect on phone and desktop. It runs to two
lines on the phone; on desktop the same text fits on one.

Send: "Check with Very" was not understandable. The scan-needed sheet and dialog
on `Flows/Wallet/Send` now read "Scan your palm to send", "You need a palm scan
before you can send money. It takes about a minute.", and "Scan palm". One more
"Check with Very" button elsewhere in the file was changed to "Scan palm"; other
mentions of Very in captions and body copy were not reviewed.

Claim: the two rows reading "... pool, 9 Oct" now read "Lottery win · song ·
date". The line listing server states is a note for the build, not interface; it
now says so in its first sentence.

The workspace_owner also remarked that the sheets are "mostly just a wall of
text". Not acted on; the captions are long.

## Corrections after the owner review, 2026-10-12

From a relayed review, each checked before acting.

Claim wording brought into line with Send on `Flows/Wallet/Claim`: both
scan-needed sheets read "You need a palm scan before you can claim. It takes
about a minute." with the button "Scan palm". The verification page itself still
names the Very app.

Royalties. The Claim caption said royalties are claimed without a scan, which
follows Spec 015 section 5.2a (palm scan for pool winnings only). The
workspace_owner's 10-12 statement that nothing is claimed or sent before a palm
scan is now read to include royalties, and the caption says so and flags it as a
change to the spec and to the royalty claim, to confirm. Royalty claim screens
are not drawn.

Send return. `Flows/Wallet/Send` has a new proposed state, "Palm scan done. You
can send now.", whose Continue returns to the sending profile and opens Send
details. The scan sends nothing. Not built: no palm check on Send in the server,
and no Send purpose or return on the verification page.

Study miss. The app treats a graded spoken miss as final for that appearance
(`src/features/studying/studying-route-view.tsx`, the comment near line 224),
moves on at once after a correct spoken answer, and waits 700 milliseconds after
a correct choice. The screen offering Record again after a first miss was
removed; one incorrect screen remains, with Continue.

Record notes after a further relayed review. The Study quotation in the section
"Owner review of the sheets" is the workspace_owner's message as received in
this session; the reviewer saw a differently garbled copy. It stays as quoted.
The current list near the top now carries the royalty question, the missing Send
verification purpose and return, and the fact that the Send scan-complete state
is drawn on desktop only.

## Settings completed, 2026-10-12

A relayed review found the Settings page missing the app's recording-deletion
control (`src/features/shell/recordings-settings.tsx`, rendered by
`account-page.tsx`). The first version of the page listed only Telegram, Terms
and Privacy because the labels were read with a search that skipped the embedded
component. Recordings is now a row, with its page and delete confirmation drawn.
The current list was also corrected: royalty work moved to future work, and the
leaderboard omissions named exactly.

## Carried forward from 2026-09-30, and captions corrected, 2026-10-12

After a relayed review. "Moderator" became "owner" on the four Submitted pages
and in the Dance and result captions. A "Not reviewed" Dance ending was drawn
for a take nobody checked in seven days. The Karaoke-only song sheet received
the Leaderboard line. Three captions were brought up to date: Your songs (five
tabs, where a take's result is read, the Leaderboard line), the activity result
(submission-day streak credit is accepted, not a working default; the fourth
ending), and Dance (the route from a song, who reviews, the window, and the
unreconciled result route). Not drawn: the latest attempt's state on the dance's
page, the notification row for a take that was not reviewed, and the owner's
review queue.

## Notifications additions, 2026-10-12

On `Screens/Shell/Notifications`, phone only: a row "Your dance wasn't
reviewed" with a neutral mark, which opens the Not reviewed result, and an
empty page that says "Nothing yet." The sheet's caption and the result sheet's
label say which row opens which result. Checked by screenshot.

## Owner review of Dance copy, 2026-10-12

The workspace_owner, directly: the line "Passing earns the same rewards whether
your take is public or private." looked separate from the switch it explains,
and the Submitted line "If it passes, this take will appear publicly." is not
necessary. On `Flows/Dance/Take`, phone and desktop, the first is now a second
line inside the switch card, shortened to "Same rewards either way." The second
was removed from all three Submitted pages, and the private Submitted variant on
`Parts/Rewards/ActivityResult`, which differed only by that line, was deleted.
The workspace_owner also said the Notifications additions look fine.

## Consistency sweep, 2026-10-12

A text search of the Paper file for wording superseded today found six stale
notes, all corrected: the Dance sheet's group label ("moderator", "working
default"), the Wallet caption and the post page's caption and flattened-reply
notes (defaults now accepted), and the shell caption (the phone menu and
Settings listed as not drawn). This was a search for known phrases, not a
screen-by-screen review of every sheet.

One inconsistency found and not resolved. `Screens/Community/Management` says a
community is run by its owner and moderators, has a Moderator section in the
sidebar, a state for "a moderator who isn't the owner", and a Queue where dances
are passed or failed. The 2026-09-30 ruling says the community's owner reviews
dances because there is no moderator role. Either a moderator may pass dances,
or the Dances list is owner-only; the sheet does not say. The Management
caption also says the dancer "is told in Notifications" and dates the dance
check to the 2026-10-09 ruling. For the coordinator's reconciliation.

Smaller leftovers, not corrected: the Video sheet's caption refers to
"Screens/Dance" and "Screens/Notifications", names those sheets no longer have;
sample song names differ between the result master and the Dance flow.

Corrections to the sweep above, after a relayed review. Dance review is
owner-only and was already settled: `tasks/records/api-dance-moderator-verdict.md`
requires it, excludes the dancer, and checks authority when the verdict is
saved. The question of whether a non-owner moderator may pass dances is
withdrawn. The Management caption now says Dances is the owner's alone and that
a non-owner moderator sees Reports only, and the non-owner example on
`Flows/Community/Address` says the same. The review queue was already drawn; an
earlier statement here that it was not drawn was wrong. The Video sheet's two
obsolete sheet names were corrected. Differing sample song names between a
master and a flow are accepted.

Further correction, after a relayed review. "A non-owner moderator sees Reports
only" was unsupported and is withdrawn. Spec 010 section 7, and
`tasks/records/community-moderation-authority-runtime.md`, give both viewing and
acting on moderation to the active community owner alone; global moderator scope
grants nothing, and delegated moderators are deferred. Both Dances and Reports
are owner-only at launch. The Management caption and the non-owner note on
`Flows/Community/Address` now say so, and say that "moderator" wording and the
sidebar's Moderator section describe that later role. The sidebar's Moderator
section label, and the screens that show a non-owner with a Queue row, were not
redrawn; a new moderator role would be separate scope.

## The word "take" removed from screens, 2026-10-12 (workspace_owner)

The workspace_owner: "i don't care for the 'take' as the word, most won't
understand that, and won't translate well". No screen says "take" now. The row
on the dance's page reads "Your dance". The proposed withdrawal reads "Cancel
this dance" on the Submitted page, and its sheet "Cancel this dance?" with
"Cancel dance" and "Keep it". "Cancel" also replaces "Withdraw" as the plainer
word; that substitution is the design agent's choice. The server state is still
called withdrawn, and notes still say take or attempt where they must tell one
recording from the dance it copies.

Leftover: the Dance sheet's caption, the result sheet's caption and the note
beside the dance-page states still quote the old labels "Your take" and
"Withdraw take". The result sheet's group label is corrected. Earlier sections
of this handoff use the old labels as they were at the time.

Wording revised again the same day, on the reviewer's proposal, after the
workspace_owner asked whether "submission" is clear. "Cancel this dance" could
read as removing the original dance, so the screens now say "Your video" for
what the person sent and cancel the review, not the dance: "Cancel review",
then "Cancel review of this video?", "This video won't be reviewed. You can
record another.", with "Cancel review" and "Keep waiting". Not confirmed by the
workspace_owner. Screens still use "Submitted" as a heading and "Submit for
review" as a button; whether those two are clear enough is not settled either.

# Paper design rulings, 2026-10-08 to 2026-10-09

This is a no-context brief on the design work done in the Paper file "Pirate
Design System" (file id `01M4DWHDEJ6WVWRH6FVX7E3017`). It records what the
workspace_owner decided, what an agent chose and the owner has not yet
confirmed, and where each design lives. Nothing here is implemented. No product
repository was changed, and no task record exists for this work yet.

The Paper file is the design source. Each sheet carries a caption, and a caption
that says "Design change from the code" marks an implementation task. Where a
caption adds "not yet approved", the change is an agent proposal.

Code facts below were read from `pirate-web-solid` at `ec728cf` and from the
specs under `docs/specs/api-next/` in the canonical workspace. Three of the
reads were done by read-only subagents and were not checked in a browser.

## Where the designs are

Paper has six pages. Foundations, Components and Patterns mirror the Storybook
tiers. Parts and Screens hold the work described here. Flows is empty.

On the Parts page, under the index: `Parts/Posts/PostCard`,
`Parts/Rewards/SongEarnSheet`, `Parts/Shell/AppSidebar`, and
`Parts/Verification/VerifySheet`. Three of these are new designs with no
Storybook story: PostCard, SongEarnSheet and VerifySheet.

On the Screens page, in one row from the left: `Screens/Feed`,
`Screens/Community/CommunityPage`, and
`Screens/Community/CommunityPage/Posting`.

On the Patterns page, the sheets changed in this work are
`Patterns/Engagement/VerticalFeed`, `Patterns/Navigation/FlatTabs` and
`Patterns/Engagement/CommunityAvatar`.

## Rulings the workspace_owner gave

These are the owner's own decisions.

1. Unused patterns are deleted. Ten pattern sheets with no caller in the app
   were removed from Paper: ActionBanner, IllustratedState, StatusCard, ListRow,
   MediaUploadField, AvatarBadge, StackPageShell, AppHeader, Sidebar and
   StackedSectionNav. The code still has them, and `CardShell` in the
   layout-shell file is also unused.
2. A post starts only from a community page. On Pirate there is no Post in the
   sidebar and none on the home feed, because a post belongs to a community and
   the shell cannot know which one is meant. A shell-level Post is acceptable
   only on a dedicated single-community domain.
3. Community header actions depend on the viewer. A visitor, signed in or not,
   sees Follow and Join. A viewer who follows but has not joined sees Join only.
   A member sees Post only. Unfollow and Leave sit in a More menu at the top
   right of the banner, a dropdown on desktop and a sheet on phone.
4. Version one has no request-to-join. A community is open or gated, and a gate
   is a Very palm scan or a nationality proof with Self or ZKPassport.
5. Desktop tab bars are left-aligned at their own width and never stretched
   across the page. Phone tab bars keep equal columns.
6. In the vertical feed, mute is not in the action rail, and the rail carries
   the Study, Karaoke and Dance buttons.
7. Reward pills on the vertical feed sit below the song line, are colour coded
   by kind, are text only with no icon, stay on one line and never stack. The
   pooled lottery pill reads "$1M lottery", showing the live jackpot.
8. Tapping a reward pill opens a rewards surface, a modal on desktop and a
   sheet on phone. It lists activities, and each activity carries the pills for
   what it pays. Rewards are never shown apart from the activity that earns
   them, and the surface does not state qualification scores.
9. A post card has the vote pill, the comment pill and a third, minimal rewards
   pill that opens the same rewards surface. The card's rewards pill does not
   name individual rewards.
10. Forms mark required fields with an asterisk and never label a field
    optional. A text post's title is required.
11. A multi-step form has its way out at the top left, a close on the first
    screen and a back arrow on later steps. There is no permanent heading with
    a Cancel button and no separate Back button.
12. On phone the forward button of a task screen sits in a footer, full width,
    and is a labelled button, not an arrow icon. The composer, Study, Karaoke
    and the other task screens should share one page structure.
13. A sheet or search does one thing. The add-collaborator sheet only finds a
    person; the share is set on the page afterwards.
14. After a song is posted, the author sees one vertically centred state on the
    same page, not a card in the feed.
15. The song match check runs on the first step, so the author is told before
    filling in the rest, and the state machine should be changed once to do it.
16. Instrumental and vocals uploads exist on the song step and are not
    required. Stem separation may be added later for songs with lyrics and no
    instrumental.
17. An earnings recipient may be any wallet, and names such as `name.pirate`,
    `name.tld` and `name@space` should resolve. This is low priority.

## Choices an agent made that the owner has not confirmed

1. The post card's rewards pill is a gift mark with a count.
2. The More menu always contains Share, so it is never empty.
3. Joining also follows the community, and an account that cannot join sees
   Follow only.
4. Join is always labelled "Join"; the gate is shown in the verification sheet.
5. One verification sheet serves joining, viewing adult content and claiming
   winnings: a QR code on desktop, one "Open Very" button on phone, and it
   closes by itself when the proof arrives.
6. About appears once on the community page: a card beside the feed on desktop
   with no About tab, and a tab on phone with no description under the title.
7. There is one tab style, the flat underline bar; the profile page moves to
   it and the Tabs component is removed.
8. Sidebar community rows use the coloured community avatar.
9. Mute sits alone at the top right of the video.
10. The post card gains a video kind.
11. Forward buttons read "Next" and then "Post".
12. A new collaborator arrives with half of the author's remaining share.
13. A text post's body is not required.
14. A matched song shows the matched title and artist with one button,
    "Replace audio". A route for an author who disputes the match was proposed
    and is not drawn.
15. The feed's empty and error wording differs from the code and is captioned
    as not yet approved.
16. The Dance rail button uses a camera icon as a stand-in; the icon set has no
    dance icon.

## Conflicts with existing documents and code

The rewards design brief, `docs/design/rewards-ui.md`, freezes the wording
"Megapot ticket" and forbids the bare word "lottery". Owner ruling 7 replaces
it with "$1M lottery". The brief has not been amended.

Spec 007 carries an owner amendment dated 2026-08-29 saying a recognized match
blocks publication. Spec 013 instead moves a matched song to
`action_required(reference_required)`, and the app implements that with a form
asking the author to name the original. The design follows the block and does
not draw the form. Which rule is current has not been settled.

Spec 015 does not contain the vaulted-collectible reward kind; that amendment
is drafted and unpublished. The collectible reward pill was removed from the
drawing until its naming is decided.

The September decision that put the phone composer's forward button in a
sticky top bar with no footer is reversed by owner ruling 12.

## Work the designs imply outside the app's presentation

The home feed has no reward data today, so the feed pills and the post card's
rewards pill need an API source. The viewer rewards surface described in the
rewards design brief was never built.

The app has two verification implementations: a full-page route for the Very
palm scan, which the join path never returns from, and a separate modal for
Self and ZKPassport, which needs Join tapped again afterwards. The single
verification sheet replaces both.

The community feed's post type is text or song, so a video card needs a new
kind. The community page already ships a sort control with Best, New and Top;
its place in the new header has not been designed.

The API takes each earnings recipient as a profile id, so paying a bare wallet
needs an API change. The song step takes one MP3 and has no stem uploads, and
karaoke currently plays the full track; both need pipeline work.

Showing the match result after the first step probably needs little server
work, because spec 013 moves from the finalized upload straight into analysis
and spec 007 says the check starts when the upload is sealed. This was read
from the specs and not verified against the running pipeline.

No measurement of song processing time was found. "About a minute" exists only
as copy and was left off the processing state.

## What is not drawn

On the Posting sheet: the collaborator search on desktop, the desktop versions
of the non-matched states, the video flow, and a member with no profile chosen
for the community.

On the community page: the sort control, and the loading, empty and error
states.

In the verification sheet: the profile-choice step, the adult-content title
variant, the QR step after choosing Self or ZKPassport, and failure states.

In the rewards sheet: claimed, exhausted, entry-closed and blocked states, the
streak strip, and the pool disclosures the rewards brief requires.

Whole screens: create community, profile, sign in, Study and Karaoke. The
Foundations icons sheet, twelve of the fourteen Parts stories, and the cull of
variant matrices on the older Components sheets also remain.

## Working in the Paper file

Artboard names are Storybook titles, or the intended title for a new design.
Every page has an `_Index` artboard at the top left, with one row of sheets per
category below it; on the Screens page the screens sit in one row. Place a new
artboard into that grid by setting its position, because the tool otherwise
drops it in an arbitrary free spot.

Heights of sheets on a page the owner is not viewing come back empty. To
measure them, export each artboard as a small JPEG, in batches of six or fewer,
read the image height, and delete the files the export writes to the downloads
folder.

Before drawing anything, count its callers in the app. Tell the owner which
page and sheet to open, and put the group under review at the top of its sheet.

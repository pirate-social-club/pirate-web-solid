# Song video and Dance rollout

Status: Phase 1 product surface ratified 2026-09-29; later phases remain draft.
Owner: video lane executor, under the owner's product direction.

This specification sequences product delivery. It adds no new aggregate,
policy or money rule. Spec 013 (and its §5A video-track amendment) owns video
Posts and `song_reference`; Spec 021 owns choreographies, Dance sessions,
grading and qualification; Spec 015 owns rewards. Where a phase below needs a
change to those specifications, it names the amendment instead of making it
here.

## 1. The product in one paragraph

Anyone can post a short video to a song. A post can later say what dance it
is: a new dance the author is introducing, or a take on someone else's dance
("take" is the product term; every song-backed video is already a derivative
use of the song). Takes on an existing dance can be graded against that dance,
and song reward terms can pay graded takes, so a song owner can pay people to
learn a routine. Grading never posts anything by itself: posting is always the
dancer's separate choice.

## 2. Phases

### Phase 1 (v1): song videos to the feed

The author chooses a song and a 3–15 second excerpt, records with the guide
song (or uploads a clip), and publishes. The upload seals, the composer closes
and the author lands on Home. The server analyzes the video, decides safety
automatically, renders the canonical song master, delivers it through Stream
and adds it to Home with the song chip and the chosen soundtrack. The video
appears as soon as it is playable. An author profile grid is not a v1
requirement; it may be designed separately after launch.

Rules:

1. No drafts, no status pages, no "Waiting for review", no resume screen
   (owner rulings). After the upload seals the device forgets the video.
2. No routine moderator approval step, queue or approval screen (owner
   ruling). Publication is automatic once the automated safety checks pass. A
   serious safety failure keeps the video private and the author gets a simple
   explanation; that exception path is not an approval queue.
3. Failure contract: persisted provider results replay; an uncertain provider
   dispatch is never automatically resent; missing or failed evidence never
   permits publication.
4. If processing reaches a terminal failure after the composer closes, the
   author sees one small, dismissible notice on Home the next time they open
   the app: "Your video couldn't be posted. Record it again." The notice is
   shown once per failed submission. "Record again" opens a fresh composer
   with the same song preselected; it does not restore a take, retain a
   draft, or resend an uncertain provider request. Immediate upload failures
   remain on the posting screen. A safety-policy block keeps its separate,
   private explanation and is not presented as an ordinary processing retry.
5. No dance identity, grading or rewards.

v1 safety gate (owner ruling 2026-09-25): OpenAI moderation of the analysis
frames and the caption decides automatically. A flagged video is blocked and
stays private; a clean result publishes under the Spec 013 `sampled_frame_openai_v1`
gate (amendment 2026-09-25), with the OpenAI results recorded as
sampled-frame moderation evidence, never as minor-safety evidence. A dedicated visual child-safety provider is
post-v1 (task `visual-minor-safety-provider-selection`, research in its
evidence folder); the owner judged it overengineering for v1. Known limit,
recorded once: OpenAI checks three stills, its `sexual/minors` category is
text-only, and OpenAI states its moderation is not dedicated child-safety
detection.

Exit criteria: the one-command phone e2e passes with no approval step (record
→ publish → lands on Home → video first on Home with the song chip, muted
autoplay → delivered audio equals the chosen excerpt at 0 ms offset); median
Home time to playback under 5 s on the Pixel. A separately induced terminal
processing failure must show the one-time Home notice to its author, open a
fresh song-preselected composer from "Record again", and never expose the
failed video to another viewer.

### Phase 2: dance identity on posts, no grading

At publish the author picks one of:

- **Just a video** (default): Phase 1 behaviour.
- **My new dance**: the post becomes the public reference video of a new
  choreography (Spec 021 §4) over the post's song excerpt. Spec 021 requires
  a scored interval of 6–30 s, so with the 15 s post cap a new dance is 6–15 s;
  a shorter clip cannot be a dance.
- **A take on a dance**: the author picks a ready choreography revision for
  the same song; the post credits it ("Dance by @choreographer").

The post publishes normally in every case. A new choreography becomes
selectable by others only after its reference processing is ready (Spec 021
§4.2); until then it is visible as a post but cannot be credited or graded.
Originality is self-declared in this phase.

Surfaces: the song page lists its dances; a dance page shows the reference
and its takes.

Amendment needed: Spec 013 video creation gains an optional dance intent
(`none | new_choreography | take_of_revision`) that Spec 021 consumes.

### Phase 3: grading takes on a dance

Grading applies only to a take on a selected choreography revision (Spec 021
§1.5; freestyle is a non-goal). New dances are not graded: they are the
reference.

Flow: pick a dance → private Dance session (Spec 021 §5) → record → private
grade → choose **Post this take** or discard. Posting is a separate Post
creation (Spec 021 §10) and is never automatic.

Amendment needed: Spec 021 (§10 and its retention rules) deletes the private
attempt media after grading. "Post this take" needs a consented, time-limited
transition: after the grade, the dancer is offered to post that same
recording; accepting starts an ordinary Post creation from the sealed attempt
object before its deletion deadline, and the grade itself never becomes
public evidence of the post. Declining, or the deadline passing, deletes the
media on the existing schedule. Without this amendment the dancer records again
to post.

Calibration starts in `shadow` (Spec 021 §7): grades are private diagnostics
and create no qualification.

### Phase 4: rewards on dances

Rewards attach to eligible song reward terms (Spec 015 song offer legs or
community programs), whose Dance-aware objectives may name one exact
choreography revision or any accepted one (Spec 021 §1.9, §9); a dance itself
carries no reward. Takes qualify only through graded sessions
started in `reward_eligible` mode under a money-admitted calibration. Spec 015
human verification applies to every monetary benefit.

## 3. Decisions for the owner

| # | Question | Proposed answer |
|---|---|---|
| D1 | Is grading required to post a take on a dance? | No. Crediting a dance is free; grading is opt-in (practice or a reward). |
| D2 | Can a new dance be posted before its reference processing is ready? | Yes. The post publishes at once; the dance becomes creditable and gradable when ready. |
| D3 | New-dance length | 6–15 s (Spec 021 minimum, v1 post maximum). |
| D4 | Does a graded take show its score publicly when posted? | No in Phase 3. Scores stay private until a later decision. |

## 4. Current state (2026-09-29)

The Pixel staging happy path passes from recording through automatic safety,
render, Stream and Home with no approval or render operator command. The
staging PCM gate reports all eight public songs video-ready. This is not a
production release: CloudConvert dispatch and seal, automatic PCM generation
for new songs, retirement of the workstation renderer, and production gates
remain open. The one-time Home processing-failure notice is ratified but not
implemented or phone-proven. An author profile grid is outside v1.

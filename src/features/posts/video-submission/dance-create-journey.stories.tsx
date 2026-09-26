/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { AppHeader } from "@pirate/web-solid-ui";

import { Button, IconMusicNote, IconPlay, Type } from "../../../design-system";
import dancePosterSheet from "./fixtures/dance-poster-sheet.png";

/** The dance create journeys, as fixture-backed design prototypes on the
 * capture-first flow. They establish what the Dance successor must build:
 * song chooser → that song's dance grid → fixed section or trim → capture →
 * review or a labelled private score. The camera's song control returns to
 * the chooser, which leads back through the dances for that song. Nothing here contacts a
 * server, opens a camera, grades anything, or pays anything. The score and
 * Post this take screens are labelled fixtures: the private-attempt lane is
 * still planned, no grading provider is selected, and posting the same
 * graded recording needs the recorded media-handoff amendment. */

type Screen = "capture" | "chooser" | "preview" | "dances" | "detail" | "review" | "score";

interface FixtureSong {
  readonly postId: string;
  readonly title: string;
  readonly artist: string;
  readonly length: string;
}

interface FixtureDance {
  readonly id: string;
  readonly songPostId: string;
  readonly name: string;
  readonly creator: string;
  readonly duration: string;
  readonly section: string;
  readonly posterIndex: 0 | 1 | 2 | 3;
}

const songs: readonly FixtureSong[] = [
  { postId: "cadence", title: "Cadence", artist: "salt-cove.pirate", length: "2:14" },
  { postId: "low-tide", title: "Low Tide", artist: "drift-reef.pirate", length: "3:01" },
];

const dances: readonly FixtureDance[] = [
  { id: "step-back", songPostId: "cadence", name: "Step Back", creator: "@salt-cove", duration: "0:12", section: "Cadence · 0:42–0:54", posterIndex: 0 },
  { id: "cross-step", songPostId: "cadence", name: "Cross Step", creator: "@harbor-beat", duration: "0:11", section: "Cadence · 0:18–0:29", posterIndex: 1 },
  { id: "turn-and-clap", songPostId: "cadence", name: "Turn & Clap", creator: "@sunward", duration: "0:13", section: "Cadence · 1:02–1:15", posterIndex: 2 },
  { id: "backbeat", songPostId: "cadence", name: "Backbeat", creator: "@blue-wake", duration: "0:10", section: "Cadence · 0:54–1:04", posterIndex: 3 },
  { id: "side-turn", songPostId: "low-tide", name: "Side Turn", creator: "@night-owl", duration: "0:09", section: "Low Tide · 0:03–0:12", posterIndex: 2 },
  { id: "low-step", songPostId: "low-tide", name: "Low Step", creator: "@reef-light", duration: "0:12", section: "Low Tide · 0:40–0:52", posterIndex: 3 },
];
const profiles = ["@harbor-persona", "@reef-persona"] as const;
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const posterStyle = (index: 0 | 1 | 2 | 3): JSX.CSSProperties => ({
  "background-image": `url(${dancePosterSheet})`,
  "background-size": "auto 100%",
  "background-position": `${index * 100 / 3}% center`,
});

function FixtureBadge(props: { readonly label: string }) {
  return (
    <span class="inline-flex items-center rounded-full border border-border-soft bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {props.label}
    </span>
  );
}

function JourneyHeader(props: {
  readonly backAriaLabel: string;
  readonly center?: JSX.Element;
  readonly mediaOverlay?: boolean;
  readonly onBack: () => void;
}) {
  return (
    <AppHeader
      forceMobile
      hideBrand
      hideMobileBrand
      labels={{ backAriaLabel: props.backAriaLabel }}
      mobileAppearance={props.mediaOverlay ? "media-overlay" : "default"}
      mobileCenterContent={props.center ?? <span />}
      mobileTrailingContent={<span aria-hidden="true" class="block size-11" />}
      onBackClick={props.onBack}
      showChatAction={false}
      showConnectAction={false}
      showCreateAction={false}
      showNotificationsAction={false}
      showProfileAction={false}
      showWalletAction={false}
    />
  );
}

/** One reusable full-screen vertical stage: video fills the viewport,
 * the app's media header sits on top, and each surface supplies its overlay.
 * A real 9:16 video would cover this frame as it does in the feed. */
function VerticalStage(props: { readonly onBack: () => void; readonly posterIndex?: 0 | 1 | 2 | 3; readonly children?: JSX.Element }) {
  return (
    <div class="relative h-dvh overflow-hidden bg-black text-white" data-vertical-stage>
      <div class="absolute inset-0 bg-gradient-to-b from-[#262a30] to-[#0d0f12]" style={props.posterIndex === undefined ? undefined : posterStyle(props.posterIndex)}>
        <div class="relative grid h-full w-full place-items-center" data-video-viewfinder>
          {props.children ?? <span class="text-sm text-white/70">Video (fixture)</span>}
        </div>
      </div>
      <JourneyHeader backAriaLabel="Back" mediaOverlay onBack={props.onBack} />
    </div>
  );
}

function JourneyFrame(props: {
  /** The selected song's grid starts with ready dances, or with none yet. */
  readonly withDances?: boolean;
}) {
  const [screen, setScreen] = createSignal<Screen>("capture");
  const [chooserReturn, setChooserReturn] = createSignal<"capture" | "dances">("capture");
  const [trimOpen, setTrimOpen] = createSignal(false);
  const [song, setSong] = createSignal<FixtureSong>();
  const [dance, setDance] = createSignal<FixtureDance | "new">();
  const [captureMode, setCaptureMode] = createSignal<"post" | "score">("post");
  const [recording, setRecording] = createSignal(false);
  const [sectionStart, setSectionStart] = createSignal(42);
  const [profile, setProfile] = createSignal<(typeof profiles)[number]>(profiles[0]);
  const [profileOpen, setProfileOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [previewing, setPreviewing] = createSignal<FixtureSong>();
  /** The chosen reference dance, narrowed away from the "new" marker; the
   * detail screen only renders while a concrete dance is chosen. */
  const referenceDance = () => {
    const current = dance();
    return current !== undefined && current !== "new" ? current : undefined;
  };
  const chooseSong = (next: FixtureSong) => {
    // Choosing a song always clears the dance: the target must belong to
    // the song it was made for.
    setSong(next);
    setDance(undefined);
    setRecording(false);
    setSectionStart(42);
    setScreen("dances");
  };
  const visibleDances = () => props.withDances === false
    ? []
    : dances.filter(candidate => candidate.songPostId === song()?.postId);

  return (
    <div class="min-h-dvh bg-background text-foreground" data-dance-journey data-screen={screen()}>
      <Show when={screen() === "capture"}>
        <div class="relative h-dvh overflow-hidden bg-black text-white">
          <div class="absolute inset-0 grid place-items-center">
            <div class="aspect-[9/16] w-full max-w-[56.25dvh] bg-gradient-to-b from-[#262a30] to-[#0d0f12]" data-video-viewfinder />
          </div>
          <header class="absolute inset-x-0 top-0 z-10 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              aria-label={song() ? `Song: ${song()!.title}. Change the song` : "Add song"}
              class="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full bg-black/45 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm"
              disabled={recording()}
              onClick={() => { setChooserReturn("capture"); setScreen("chooser"); }}
              type="button"
            >
              <IconMusicNote aria-hidden="true" class="size-4 shrink-0" />
              <span class="truncate">{song() ? song()!.title : "Add song"}</span>
            </button>
          </header>
          <div class="absolute inset-x-0 bottom-0 z-10 grid place-items-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <button
              aria-label={recording() ? "Stop recording" : "Start recording"}
              class="grid size-[74px] cursor-pointer place-items-center rounded-full border-4 border-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!song()}
              onClick={() => {
                if (!recording()) { setRecording(true); return; }
                setRecording(false);
                setScreen(captureMode() === "score" ? "score" : "review");
              }}
              type="button"
            >
              <span class={recording() ? "size-7 rounded-md bg-[#f0453a]" : "size-[58px] rounded-full bg-[#f0453a]"} />
            </button>
          </div>
        </div>
      </Show>

      <Show when={screen() === "chooser"}>
        {/* Fixed, TikTok-shaped: the screen never scrolls; the list owns
         * any overflow. A back button and the search field are the whole
         * header. */}
        <div class="flex h-dvh flex-col overflow-hidden bg-background" data-song-chooser>
          <JourneyHeader
            backAriaLabel={chooserReturn() === "dances" ? "Back to dances" : "Back to capture"}
            center={<input
              aria-label="Search songs"
              class="w-56 min-w-0 max-w-full rounded-full border border-border-soft bg-background px-4 py-2 text-base"
              onInput={event => setQuery(event.currentTarget.value)}
              placeholder="Search songs"
              type="search"
              value={query()}
            />}
            onBack={() => setScreen(chooserReturn())}
          />
          <div aria-hidden="true" class="shrink-0" style={{ height: "calc(var(--header-height) + env(safe-area-inset-top))" }} />
          <ul aria-label="Songs" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3">
            <For each={songs.filter(candidate => candidate.title.toLowerCase().includes(query().trim().toLowerCase()))}>
              {candidate => (
                <li class="flex items-center gap-3 rounded-[var(--radius-lg)] p-2">
                  <button
                    aria-label={`Play ${candidate.title}`}
                    class="grid size-11 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] bg-muted text-foreground"
                    onClick={() => { setPreviewing(candidate); setScreen("preview"); }}
                    type="button"
                  >
                    <IconPlay class="size-5" />
                  </button>
                  <button
                    class="min-w-0 flex-1 cursor-pointer truncate text-start"
                    onClick={() => chooseSong(candidate)}
                    type="button"
                  >
                    <Type as="span" variant="body-strong" class="block truncate">{candidate.title}</Type>
                    <Type as="span" variant="caption" class="block truncate text-muted-foreground">{candidate.artist} · {candidate.length}</Type>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={screen() === "preview"}>
        <VerticalStage onBack={() => { setPreviewing(undefined); setScreen("chooser"); }}>
          <span class="text-sm text-white/70">{previewing()?.title} · video (fixture)</span>
        </VerticalStage>
      </Show>

      <Show when={screen() === "dances"}>
        <div class="flex h-dvh flex-col overflow-hidden bg-background" data-dance-grid>
          <JourneyHeader
            backAriaLabel="Back to songs"
            center={<span class="block min-w-0 truncate text-sm font-semibold">{song()?.title}</span>}
            onBack={() => { setChooserReturn("dances"); setScreen("chooser"); }}
          />
          <div aria-hidden="true" class="shrink-0" style={{ height: "calc(var(--header-height) + env(safe-area-inset-top))" }} />
          <div class="min-h-0 flex-1 overflow-y-auto">
            <ul aria-label={`Dances to ${song()?.title ?? "this song"}`} class="grid grid-cols-3 gap-0.5">
              <li>
                <button
                  aria-label="Create new dance"
                  class="grid aspect-[9/16] w-full cursor-pointer place-items-center border border-border-soft bg-background p-3 text-center text-xs font-medium text-foreground"
                  data-create-new-dance
                  onClick={() => { setDance("new"); setCaptureMode("post"); setTrimOpen(true); }}
                  type="button"
                >
                  Create new dance
                </button>
              </li>
              <For each={visibleDances()}>
                {candidate => (
                  <li>
                    <button
                      aria-label={`Watch ${candidate.name} by ${candidate.creator}`}
                      class="relative block aspect-[9/16] w-full cursor-pointer overflow-hidden bg-[#20242b] text-start text-white"
                      data-dance-row={candidate.id}
                      onClick={() => { setDance(candidate); setScreen("detail"); }}
                      type="button"
                    >
                      <span class="absolute inset-0" style={posterStyle(candidate.posterIndex)} aria-hidden="true" />
                      <span class="absolute inset-x-0 bottom-0 grid gap-0.5 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-8">
                        <span class="truncate text-xs font-semibold">{candidate.name}</span>
                        <span class="truncate text-[11px] text-white/75">{candidate.creator}</span>
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <Show when={visibleDances().length === 0}>
              <p class="px-4 py-5 text-sm text-muted-foreground" data-no-dances>No dances to {song()?.title} yet.</p>
            </Show>
            <button
              class="mx-3 my-4 cursor-pointer text-start text-sm text-muted-foreground"
              onClick={() => { setDance(undefined); setCaptureMode("post"); setScreen("capture"); }}
              type="button"
            >
              Post a regular video with this song
            </button>
          </div>
        </div>
      </Show>

      <Show when={screen() === "detail"}>
        {/* The reference is the page: the same reusable full-screen stage
         * the feed and song previews use, with the dance's facts and
         * actions as the overlay. */}
        <VerticalStage onBack={() => setScreen("dances")} posterIndex={referenceDance()?.posterIndex}>
          <div class="absolute inset-x-0 bottom-0 z-10 grid gap-3 bg-gradient-to-t from-black/80 to-transparent p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-start" data-dance-detail>
            <div class="grid gap-0.5">
              <Type as="p" variant="body-strong" class="text-white">{referenceDance()?.name}</Type>
              <Type as="p" variant="caption" class="text-white/80">{referenceDance() ? `${referenceDance()!.creator} · ${referenceDance()!.duration}` : ""}</Type>
              {/* Spec 021 binds the movement to its excerpt: an existing
                  dance's section is stated, never edited. */}
              <Type as="p" variant="caption" class="text-white/70">{referenceDance()?.section} · fixed section</Type>
            </div>
            {/* The Dance session freezes this profile and the exact revision
                before capture; posting eligibility is a separate gate. */}
            <div class="flex items-center justify-between rounded-[var(--radius-lg)] bg-white/10 px-3 py-2 backdrop-blur-sm">
              <Type as="p" variant="caption" class="text-white">Dancing as {profile()}</Type>
              <Button onClick={() => setProfileOpen(true)} size="sm" variant="ghost">Change</Button>
            </div>
            <div class="grid gap-2">
              <Button data-try-score onClick={() => { setCaptureMode("score"); setScreen("capture"); }} size="lg">Try for a private score</Button>
              <Button data-record-to-post onClick={() => { setCaptureMode("post"); setScreen("capture"); }} size="lg" variant="secondary">Record a take to post</Button>
            </div>
          </div>
        </VerticalStage>
      </Show>

      <Show when={screen() === "review"}>
        <div class="min-h-dvh bg-background p-4" data-review>
          <Type as="h1" variant="h2" class="pb-3">Review video</Type>
          <div class="mx-auto grid aspect-[9/16] max-h-[52dvh] w-full max-w-sm place-items-center rounded-[var(--radius-2xl)] bg-gradient-to-b from-[#262a30] to-[#0d0f12] text-sm text-white/70">Your take (fixture)</div>
          <p class="mx-auto max-w-sm pt-3 text-sm text-muted-foreground">Posting as {profile()} · destination and caption confirm here · Publish</p>
        </div>
      </Show>

      <Show when={screen() === "score"}>
        <div class="min-h-dvh bg-background p-4" data-score-result>
          <Type as="h1" variant="h2" class="pb-2">Your score</Type>
          <div class="flex items-center gap-3 pb-1">
            <Type as="p" variant="h1">78</Type>
            <FixtureBadge label="Fixture — not a live promise" />
          </div>
          <p class="pb-6 text-sm text-muted-foreground">Private diagnostics only. No streak, no reward, no lottery.</p>
          <div class="grid gap-2">
            <Button size="lg" onClick={() => setScreen("capture")}>Retake</Button>
            <div class="flex items-center gap-2">
              <Button size="lg" variant="secondary">Post this take</Button>
              <FixtureBadge label="Fixture — needs the media-handoff amendment" />
            </div>
          </div>
        </div>
      </Show>

      {/* The new-dance trim sheet: the only place a section is chosen. */}
      <Show when={trimOpen()}>
        <div class="fixed inset-0 z-40 bg-black/55" data-trim-scrim onClick={() => setTrimOpen(false)} />
        <div
          aria-label="Choose the section"
          aria-modal="true"
          class="fixed inset-x-0 bottom-0 z-50 grid max-h-[70dvh] gap-4 rounded-t-[var(--radius-sheet)] border-t border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl"
          data-trim-sheet
          role="dialog"
        >
          <Type as="h2" variant="h3">New dance to {song()?.title}</Type>
          <div class="grid gap-2">
            <input
              aria-label="Where the song starts"
              class="w-full accent-primary"
              max="120"
              min="0"
              onInput={event => setSectionStart(Number(event.currentTarget.value))}
              step="1"
              type="range"
              value={sectionStart()}
            />
            <div class="flex items-center justify-between">
              <Type as="p" variant="caption" class="text-muted-foreground">{formatTime(sectionStart())} – {formatTime(sectionStart() + 12)} · 12s</Type>
              <Type as="p" variant="caption" class="text-muted-foreground">12s section</Type>
            </div>
          </div>
          <div class="flex justify-end">
            {/* Closes to the camera so the author frames the shot, then
                deliberately taps Record. */}
            <Button data-use-section onClick={() => { setTrimOpen(false); setScreen("capture"); }} size="lg">Use this section</Button>
          </div>
        </div>
      </Show>

      <Show when={profileOpen()}>
        <div class="fixed inset-0 z-40 bg-black/55" onClick={() => setProfileOpen(false)} />
        <div
          aria-label="Choose a profile"
          aria-modal="true"
          class="fixed inset-x-0 bottom-0 z-50 grid gap-3 rounded-t-[var(--radius-sheet)] border-t border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl"
          role="dialog"
        >
          <Type as="h2" variant="h3">Dance as</Type>
          <For each={profiles}>
            {candidate => <Button onClick={() => { setProfile(candidate); setProfileOpen(false); }} variant={candidate === profile() ? "default" : "secondary"}>{candidate}</Button>}
          </For>
        </div>
      </Show>
    </div>
  );
}

const meta = {
  title: "Flows/CreateEntry/DanceJourney",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Design prototypes for the dance create flow: song chooser, a 9:16 grid of dances for that song with a blank Create new dance tile first, a full-screen reference for each existing dance, a fixed section for an existing dance or a movable 12-second section for a new one, capture, and a labelled private-score fixture. Fixture-backed and unpowered: nothing contacts a server, opens a camera, grades, or pays. The score and Post this take are fixtures; production dance work stays in its contract-backed lane.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const openChooser = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const addSong = await canvas.findByRole("button", { name: "Add song" }, { timeout: 8_000 });
  addSong.click();
  // The chooser screen never scrolls: back and search are its header, and
  // the list owns overflow.
  const search = await canvas.findByLabelText("Search songs", undefined, { timeout: 8_000 });
  expect(search.closest("[data-song-chooser]")).not.toBeNull();
};

const chooseCadence = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const song = await canvas.findByText("Cadence", undefined, { timeout: 8_000 });
  song.closest("button")!.click();
  await canvas.findByRole("list", { name: "Dances to Cadence" });
};

export const NewDanceJourney: Story = {
  name: "New dance: choose song, trim, capture",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyFrame />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("the chooser opens fixed, without page scroll", async () => {
      await openChooser(canvasElement);
    });
    await step("playing a song opens the reusable full-screen stage", async () => {
      canvas.getByRole("button", { name: "Play Cadence" })!.click();
      const stage = await canvas.findByText(/Cadence · video \(fixture\)/, undefined, { timeout: 8_000 });
      expect(stage.closest("[data-vertical-stage]")).not.toBeNull();
      expect(canvasElement.querySelector("[data-dance-journey]")?.getAttribute("data-screen")).toBe("preview");
      expect(canvasElement.querySelector("[data-song-chooser]")).toBeNull();
      expect(stage.closest("[data-vertical-stage]")!.getBoundingClientRect().top).toBe(0);
      canvas.getAllByRole("button", { name: "Back" })[0]!.click();
      await canvas.findByLabelText("Search songs");
    });
    await step("choosing the song opens its dance video grid", async () => {
      await chooseCadence(canvasElement);
    });
    await step("the first grid tile opens the trim sheet", async () => {
      canvas.getByRole("button", { name: "Create new dance" })!.click();
      await canvas.findByRole("dialog", { name: "Choose the section" });
      // Use this section closes to the camera, where Record is a separate
      // deliberate tap.
      canvas.getByRole("button", { name: "Use this section" })!.click();;
      await canvas.findByRole("button", { name: "Start recording" });
    });
    await step("capture retains the chosen song", async () => {
      await canvas.findByRole("button", { name: /Song: Cadence/ });
    });
  },
};

export const ExistingDanceJourney: Story = {
  name: "Existing dance: preview, fixed section, private score",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyFrame />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("a dance row opens its detail", async () => {
      await openChooser(canvasElement); await chooseCadence(canvasElement);
      canvas.getByRole("button", { name: "Watch Step Back by @salt-cove" })!.click();
      await canvas.findByText(/fixed section/);
      await canvas.findByText("Dancing as @harbor-persona");
    });
    await step("the dancer can change profile before capture", async () => {
      canvas.getByRole("button", { name: "Change" })!.click();
      await canvas.findByRole("dialog", { name: "Choose a profile" });
      canvas.getByRole("button", { name: "@reef-persona" })!.click();
      await canvas.findByText("Dancing as @reef-persona");
    });
    await step("a private score needs no posting path", async () => {
      canvas.getByRole("button", { name: "Try for a private score" })!.click();;
      await canvas.findByRole("button", { name: /Song: Cadence/ });
      canvas.getByRole("button", { name: "Start recording" })!.click();;
      canvas.getByRole("button", { name: "Stop recording" })!.click();;
    });
    await step("the result is a labelled fixture, and posting is separate", async () => {
      const score = await canvas.findByText("78");
      expect(score).toBeTruthy();
      await canvas.findByText("Fixture — not a live promise");
      await canvas.findByText("Fixture — needs the media-handoff amendment");
      await canvas.findByText(/No streak, no reward, no lottery/);
    });
  },
};

export const NoDancesYet: Story = {
  name: "No dances yet: the create tile remains first",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyFrame withDances={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openChooser(canvasElement); await chooseCadence(canvasElement);
    await canvas.findByText("No dances to Cadence yet.");
    const first = canvas.getByRole("button", { name: "Create new dance" });
    first.click();
    await canvas.findByRole("dialog", { name: "Choose the section" });
  },
};

export const DanceJourneyManual: Story = {
  name: "The dance journey by hand",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyFrame />,
};

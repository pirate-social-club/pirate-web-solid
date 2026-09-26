/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { createSignal, For, Show } from "solid-js";

import { Button, IconMusicNote, IconPlay, IconPlus, Type } from "../../../design-system";

/** The dance create journeys, as fixture-backed design prototypes on the
 * capture-first flow. They establish what the Dance successor must build:
 * song chooser → what to make with it → fixed section or trim → capture →
 * review or a labelled private score. The camera's song control returns to
 * the chooser, which leads back through the dances for that song. Nothing here contacts a
 * server, opens a camera, grades anything, or pays anything. The score and
 * Post this take screens are labelled fixtures: the private-attempt lane is
 * still planned, no grading provider is selected, and posting the same
 * graded recording needs the recorded media-handoff amendment. */

type Screen = "capture" | "chooser" | "make" | "detail" | "review" | "score";

interface FixtureSong {
  readonly postId: string;
  readonly title: string;
  readonly artist: string;
  readonly length: string;
}

interface FixtureDance {
  readonly id: string;
  readonly name: string;
  readonly creator: string;
  readonly duration: string;
  readonly section: string;
}

const songs: readonly FixtureSong[] = [
  { postId: "cadence", title: "Cadence", artist: "salt-cove.pirate", length: "2:14" },
  { postId: "low-tide", title: "Low Tide", artist: "drift-reef.pirate", length: "3:01" },
];

const dances: readonly FixtureDance[] = [
  { id: "step-back", name: "Step Back", creator: "@salt-cove", duration: "0:12", section: "Cadence · 0:42–0:54" },
  { id: "side-turn", name: "Side Turn", creator: "@night-owl", duration: "0:09", section: "Cadence · 0:03–0:12" },
];

function FixtureBadge(props: { readonly label: string }) {
  return (
    <span class="inline-flex items-center rounded-full border border-border-soft bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {props.label}
    </span>
  );
}

function JourneyFrame(props: {
  /** The make-with screen starts with ready dances, or with none yet. */
  readonly withDances?: boolean;
  readonly manual?: boolean;
}) {
  const [screen, setScreen] = createSignal<Screen>(props.manual ? "capture" : "capture");
  const [trimOpen, setTrimOpen] = createSignal(false);
  const [song, setSong] = createSignal<FixtureSong>();
  const [dance, setDance] = createSignal<FixtureDance | "new">();
  const [query, setQuery] = createSignal("");
  const profile = "@harbor-persona";
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
    setScreen("make");
  };
  const visibleDances = () => (props.withDances === false ? [] : dances);

  return (
    <div class="min-h-dvh bg-background text-foreground" data-dance-journey data-screen={screen()}>
      <Show when={screen() === "capture"}>
        <div class="relative h-dvh overflow-hidden bg-black text-white">
          <div class="absolute inset-0 grid place-items-center">
            <div class="aspect-[9/16] w-full max-w-[56.25dvh] bg-gradient-to-b from-[#262a30] to-[#0d0f12]" data-video-viewfinder />
          </div>
          <header class="absolute inset-x-0 top-0 z-10 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              aria-label={song() ? `Song: ${song()!.title}. Change the song` : "Add sound"}
              class="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full bg-black/45 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm"
              onClick={() => setScreen("chooser")}
              type="button"
            >
              <IconMusicNote aria-hidden="true" class="size-4 shrink-0" />
              <span class="truncate">{song() ? song()!.title : "Add sound"}</span>
            </button>
          </header>
          <div class="absolute inset-x-0 bottom-0 z-10 grid place-items-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <button
              aria-label="Start recording"
              class="grid size-[74px] cursor-pointer place-items-center rounded-full border-4 border-white"
              onClick={() => setScreen(props.manual ? "review" : "score")}
              type="button"
            >
              <span class="size-[58px] rounded-full bg-[#f0453a]" />
            </button>
          </div>
        </div>
      </Show>

      <Show when={screen() === "chooser"}>
        <div class="min-h-dvh bg-background p-4" data-song-chooser>
          <div class="flex items-center gap-3 pb-4">
            <Button aria-label="Back to capture" onClick={() => setScreen("capture")} variant="ghost">✕</Button>
            <input
              aria-label="Search songs"
              class="min-w-0 flex-1 rounded-[var(--radius-lg)] border border-border-soft bg-background px-3 py-2 text-base"
              onInput={event => setQuery(event.currentTarget.value)}
              placeholder="Search songs"
              type="search"
              value={query()}
            />
          </div>
          {/* The production picker searches loaded feed pages; a catalog
              search operation is a recorded dependency of this flow. */}
          <p class="pb-2 text-xs text-muted-foreground">Searching the song catalog (fixture)</p>
          <ul aria-label="Songs" class="grid gap-1">
            <For each={songs.filter(candidate => candidate.title.toLowerCase().includes(query().trim().toLowerCase()))}>
              {candidate => (
                <li>
                  <button
                    class="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] p-2 text-start hover:bg-muted"
                    onClick={() => chooseSong(candidate)}
                    type="button"
                  >
                    <span class="grid size-11 place-items-center rounded-[var(--radius-md)] bg-muted"><IconPlay class="size-5" /></span>
                    <span class="min-w-0">
                      <Type as="span" variant="body-strong" class="block truncate">{candidate.title}</Type>
                      <Type as="span" variant="caption" class="block truncate text-muted-foreground">{candidate.artist} · {candidate.length}</Type>
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={screen() === "make"}>
        <div class="min-h-dvh bg-background p-4" data-make-with>
          <div class="flex items-center justify-between pb-4">
            <Type as="h1" variant="h2">{song()?.title ?? "Choose a song"}</Type>
            <Button onClick={() => setScreen("chooser")} variant="ghost">Change</Button>
          </div>
          <Type as="p" variant="body" class="pb-3 text-muted-foreground">What do you want to make?</Type>
          <button
            class="mb-5 grid w-full cursor-pointer gap-1 rounded-[var(--radius-xl)] border border-primary bg-primary-subtle p-4 text-start"
            data-create-new-dance
            onClick={() => { setDance("new"); setTrimOpen(true); }}
            type="button"
          >
            <span class="flex items-center gap-2 text-base font-semibold"><IconPlus class="size-5" /> Create a new dance</span>
            <span class="text-sm text-muted-foreground">Pick your section, record the reference</span>
          </button>
          <Type as="h2" variant="overline" class="pb-2 text-muted-foreground">Dances to {song()?.title ?? "this song"}</Type>
          <Show
            when={visibleDances().length > 0}
            fallback={
              <div class="grid gap-2 pb-5" data-no-dances>
                <Type as="p" variant="body">No dances to {song()?.title ?? "this song"} yet.</Type>
                <Button class="w-fit" onClick={() => { setDance("new"); setTrimOpen(true); }}>Create the first one</Button>
              </div>
            }
          >
            <ul class="grid gap-2 pb-5">
              <For each={visibleDances()}>
                {candidate => (
                  <li>
                    <button
                      class="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-xl)] border border-border-soft p-3 text-start hover:bg-muted"
                      data-dance-row={candidate.id}
                      onClick={() => { setDance(candidate); setScreen("detail"); }}
                      type="button"
                    >
                      <span class="grid size-16 place-items-center rounded-[var(--radius-lg)] bg-muted"><IconPlay class="size-6" /></span>
                      <span class="min-w-0">
                        <Type as="span" variant="body-strong" class="block truncate">{candidate.name}</Type>
                        <Type as="span" variant="caption" class="block truncate text-muted-foreground">by {candidate.creator} · {candidate.duration}</Type>
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <button
            class="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-lg)] px-2 py-3 text-start text-sm text-muted-foreground hover:bg-muted"
            onClick={() => { setDance(undefined); setScreen("capture"); }}
            type="button"
          >
            Post a regular video with this song
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </Show>

      <Show when={screen() === "detail"}>
        <div class="min-h-dvh bg-background p-4" data-dance-detail>
          <div class="flex items-center gap-3 pb-3">
            <Button aria-label="Back to dances" onClick={() => setScreen("make")} variant="ghost">‹</Button>
            <Type as="h1" variant="h2">{referenceDance()?.name}</Type>
          </div>
          <div class="mx-auto grid aspect-[9/16] max-h-[52dvh] w-full max-w-sm place-items-center overflow-hidden rounded-[var(--radius-2xl)] bg-gradient-to-b from-[#262a30] to-[#0d0f12] text-white">
            <span class="flex items-center gap-2 text-sm text-white/80"><IconPlay class="size-5" /> Reference video (fixture)</span>
          </div>
          <div class="mx-auto grid max-w-sm gap-1 py-3">
            <Type as="p" variant="body">{referenceDance() ? `${referenceDance()!.creator} · ${referenceDance()!.duration}` : ""}</Type>
            {/* Spec 021 binds the movement to its excerpt: an existing
                dance's section is stated, never edited. */}
            <Type as="p" variant="caption" class="text-muted-foreground">{referenceDance()?.section} · fixed section</Type>
          </div>
          {/* The Dance session freezes this profile and the exact revision
              before capture; posting eligibility is a separate gate. */}
          <div class="mx-auto flex max-w-sm items-center justify-between rounded-[var(--radius-lg)] border border-border-soft p-3">
            <Type as="p" variant="caption">Dancing as {profile}</Type>
            <Button size="sm" variant="ghost">Change</Button>
          </div>
          <div class="mx-auto grid max-w-sm gap-2 py-4">
            <Button data-try-score onClick={() => setScreen("capture")} size="lg">Try for a private score</Button>
            <Button data-record-to-post onClick={() => setScreen("capture")} size="lg" variant="secondary">Record a take to post</Button>
          </div>
        </div>
      </Show>

      <Show when={screen() === "review"}>
        <div class="min-h-dvh bg-background p-4" data-review>
          <Type as="h1" variant="h2" class="pb-3">Review video</Type>
          <div class="mx-auto grid aspect-[9/16] max-h-[52dvh] w-full max-w-sm place-items-center rounded-[var(--radius-2xl)] bg-gradient-to-b from-[#262a30] to-[#0d0f12] text-sm text-white/70">Your take (fixture)</div>
          <p class="mx-auto max-w-sm pt-3 text-sm text-muted-foreground">Posting as {profile} · destination and caption confirm here · Publish</p>
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
              onInput={() => undefined}
              step="1"
              type="range"
              value="42"
            />
            <div class="flex items-center justify-between">
              <Type as="p" variant="caption" class="text-muted-foreground">0:42 – 0:54 · 12s</Type>
              <Type as="p" variant="caption" class="text-muted-foreground">section 6–15s</Type>
            </div>
          </div>
          <div class="flex justify-end">
            {/* Closes to the camera so the author frames the shot, then
                deliberately taps Record. */}
            <Button data-use-section onClick={() => { setTrimOpen(false); setScreen("capture"); }} size="lg">Use this section</Button>
          </div>
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
          "Design prototypes for the dance create flow: song chooser, what to make with a song, a fixed section for an existing dance or a 6–15s trim for a new one, capture with one song control leading back through the dances for that song, and a labelled private-score fixture. Fixture-backed and unpowered: nothing contacts a server, opens a camera, grades, or pays. The score and Post this take are fixtures; production dance work stays in its contract-backed lane.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const openThroughSongChoice = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const addSound = await canvas.findByRole("button", { name: "Add sound" }, { timeout: 8_000 });
  addSound.click();
  const song = await canvas.findByText("Cadence", undefined, { timeout: 8_000 });
  song.closest("button")!.click();;
  await canvas.findByText("What do you want to make?");
};

export const NewDanceJourney: Story = {
  name: "New dance: choose song, trim, capture",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyFrame />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("song chooser → what to make", async () => {
      await openThroughSongChoice(canvasElement);
    });
    await step("Create a new dance opens the trim sheet", async () => {
      canvas.getByText("Create a new dance").closest("button")!.click();;
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
      await openThroughSongChoice(canvasElement);
      canvas.getByText("Step Back").closest("button")!.click();;
      await canvas.findByText(/fixed section/);
      await canvas.findByText("Dancing as @harbor-persona");
    });
    await step("a private score needs no posting path", async () => {
      canvas.getByRole("button", { name: "Try for a private score" })!.click();;
      await canvas.findByRole("button", { name: /Song: Cadence/ });
      canvas.getByRole("button", { name: "Start recording" })!.click();;
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
  name: "No dances yet: creating the first one is the action",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyFrame withDances={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openThroughSongChoice(canvasElement);
    await canvas.findByText("No dances to Cadence yet.");
    const first = canvas.getByRole("button", { name: "Create the first one" });
    first.click();
    await canvas.findByRole("dialog", { name: "Choose the section" });
  },
};

export const DanceJourneyManual: Story = {
  name: "The dance journey by hand",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyFrame manual />,
};

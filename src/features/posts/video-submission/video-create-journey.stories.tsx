/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { createSignal, Show } from "solid-js";

import type { AccountCommunityMembership } from "../../../api/account-community-memberships.ts";
import { ApplicationChrome } from "../../shell/media-shell/media-shell";
import { toneWavUrl } from "../video-submission/story-fixtures-media";
import { VideoCreateRouteView } from "../video-submission/video-create-route";

/** The connected create journey: the footer's center + opens the full-screen
 * capture view directly; sound is chosen in a sheet over it, and posting
 * details come at review. Everything the server would answer is stood in
 * for — the session, the postable communities, the song read, the excerpt
 * preflight, the per-persona owner policy, the picker's song list, the
 * camera preview, the take and its alignment — because Storybook has no
 * session. Each story's play function asserts the flow reached the state
 * the story names, and a manual variant walks it by hand. */

const SONG_MS = 150_000;

const memberships: readonly AccountCommunityMembership[] = [
  {
    object: "account_community_membership",
    community_id: "harbor",
    display_name: "Harbor",
    resource_href: null,
    canonical_route: {
      family: "spaces",
      root_label: "harbor",
      root_label_display: "harbor",
      path_segment: "harbor",
      href: "/c/harbor",
      app_host: null,
    },
    membership_status: "member",
    can_post: true,
  },
  {
    object: "account_community_membership",
    community_id: "open-sea",
    display_name: "Open Sea",
    resource_href: null,
    canonical_route: null,
    membership_status: "member",
    can_post: true,
  },
];

const personas = [
  { personaId: "persona-one", displayName: "Harbor Persona", avatarRef: null, primaryPublicHandle: "harbor.pirate", communityBinding: null },
  { personaId: "persona-two", displayName: "Night Persona", avatarRef: null, primaryPublicHandle: "night.pirate", communityBinding: null },
];

type PolicyFixture = "allowed" | "denied" | "failed-then-allowed";

// The journey is a phone flow: the recording controls live on the camera
// channel, which the runtime turns on for coarse pointers. Storybook runs on
// a desktop viewport, so the query is stood in for, as the video-authoring
// stories do.
window.matchMedia = (query: string): MediaQueryList => ({
  matches: query.includes("pointer: coarse"),
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
});

function JourneyScreen(props: { readonly policy: PolicyFixture }) {
  // The + navigates to /create/video; Storybook has no router, so the story
  // holds the route in its own state.
  const [open, setOpen] = createSignal(false);
  let policyCalls = 0;
  const eligibility = async () => {
    if (props.policy === "denied") return false;
    if (props.policy === "failed-then-allowed") {
      policyCalls += 1;
      return policyCalls === 1 ? Promise.reject(new Error("storybook offline")) : true;
    }
    return true;
  };
  return (
    <ApplicationChrome
      mobileActiveItem="none"
      navigate={(href) => { if (href === "/create/video") setOpen(true); }}
      signedIn
    >
      <Show when={open()}>
        <VideoCreateRouteView
          loadMemberships={async () => memberships}
          navigate={() => undefined}
          onExit={() => setOpen(false)}
          resolveSession={async () => ({ status: "authenticated" as const, userId: "storybook-account", personas })}
          videoSongEligibility={eligibility}
          videoSongPreflight={async () => ({
            state: "ready" as const,
            song_post_id: "cadence-post",
            audio_revision: 7,
            canonical_duration_samples: SONG_MS * 48,
            interval_policy: { policy_revision: 1, sample_rate_hz: 48_000 as const, min_clip_duration_samples: 144_000, max_clip_duration_samples: 8_640_000 },
            interval: { accepted: true as const },
          })}
          videoSongReader={async () => ({ postId: "cadence-post", audioUrl: toneWavUrl(SONG_MS), title: "Cadence" })}
          videoSongPicker={async () => ({
            songs: [{ postId: "cadence-post", title: "Cadence", artist: "salt-cove.pirate", artworkSrc: null }],
            nextCursor: null,
          })}
          videoStorage={{ exclusive: async work => work(), load: async () => null, save: async () => {}, remove: async () => {} }}
          videoOpenPreview={async () => new MediaStream()}
          videoStartCapture={async () => ({
            stream: new MediaStream(),
            captureOriginMs: performance.now(),
            stop: async () => new File([new Blob(["storybook-take"])], "take.mp4", { type: "video/mp4" }),
            cancel: async () => {},
          })}
          videoAlignTake={async file => ({ file, trimmedMs: 0, requestedMs: 0, aligned: true })}
        />
      </Show>
    </ApplicationChrome>
  );
}

const meta = {
  title: "Flows/CreateEntry/Journey",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The connected create journey: the footer's + opens the capture view, Add sound opens a sheet holding the song choice, excerpt and every server verdict, and posting details come at review. The session, communities, song audio, excerpt preflight, owner policy, picker, camera preview, take and alignment are Storybook stand-ins; no story contacts a server, and publishing is not stubbed — it shows its honest failure state.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens the capture view and chooses the song through the sound sheet,
   leaving the flow ready to record. */
async function openCaptureAndChooseSong(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const create = await canvas.findByRole("button", { name: "Post a video" }, { timeout: 8_000 });
  create.click();
  // The capture view opens full-screen with its own Add sound control.
  const addSound = await canvas.findByRole("button", { name: "Add sound" }, { timeout: 8_000 });
  addSound.click();
  const input = await canvas.findByLabelText("Search songs", undefined, { timeout: 8_000 }) as HTMLInputElement;
  input.value = "https://pirate.test/p/cadence-post";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const use = await canvas.findByText("Use the song at this link", undefined, { timeout: 8_000 });
  (use.closest("button") as HTMLButtonElement).click();
}

export const PlusToCaptureAllowed: Story = {
  name: "+ to capture, policy allows",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyScreen policy="allowed" />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("the footer's + opens the capture view", async () => {
      const create = await canvas.findByRole("button", { name: "Post a video" }, { timeout: 8_000 });
      create.click();
      await canvas.findByRole("button", { name: "Add sound" }, { timeout: 8_000 });
    });
    await step("Add sound opens the sheet and the song is chosen there", async () => {
      (canvas.getByRole("button", { name: "Add sound" }) as HTMLButtonElement).click();
      const input = await canvas.findByLabelText("Search songs", undefined, { timeout: 8_000 }) as HTMLInputElement;
      input.value = "https://pirate.test/p/cadence-post";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const use = await canvas.findByText("Use the song at this link", undefined, { timeout: 8_000 });
      (use.closest("button") as HTMLButtonElement).click();
      // Confirming returns to the capture view with an editable song chip.
      const confirm = await canvas.findByRole("button", { name: "Use this sound" }, { timeout: 8_000 });
      confirm.click();
      await canvas.findByRole("button", { name: /Song: Cadence/ }, { timeout: 8_000 });
    });
    await step("record opens once the sound is accepted", async () => {
      // The assertion is on the settled screen, not the moment the button
      // first appears: the preview fixture keeps the camera state stable.
      await canvas.findByLabelText("Start recording", undefined, { timeout: 12_000 });
      await new Promise(resolve => setTimeout(resolve, 800));
      expect(canvas.queryByLabelText("Start recording")).not.toBeNull();
      expect(canvas.queryByText("Recording is not supported here")).toBeNull();
    });
  },
};

export const PlusDenied: Story = {
  name: "+ to a profile the song refuses",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyScreen policy="denied" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openCaptureAndChooseSong(canvasElement);
    const denials = await canvas.findAllByText(/This profile can’t post a video to this song/, undefined, { timeout: 12_000 });
    expect(denials.length).toBeGreaterThan(0);
    // The record control is present but inert under the refusal: pressing it
    // starts nothing.
    const record = canvas.getByLabelText("Start recording") as HTMLButtonElement;
    record.click();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(canvas.queryByLabelText("Stop recording")).toBeNull();
  },
};

export const PlusFailedRead: Story = {
  name: "+ through an unreadable policy and a retry",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyScreen policy="failed-then-allowed" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openCaptureAndChooseSong(canvasElement);
    const retry = await canvas.findByText("Try the check again", undefined, { timeout: 12_000 });
    (retry.closest("button") as HTMLButtonElement).click();
    await canvas.findByLabelText("Start recording", undefined, { timeout: 12_000 });
    await new Promise(resolve => setTimeout(resolve, 800));
    expect(canvas.queryByText("Recording is not supported here")).toBeNull();
  },
};

/** The same journey with no play function, so a reviewer walks it by hand:
 * the footer's +, Add sound, the pasted song link, the excerpt, Use this
 * sound, record and stop, and the review step's posting details. */
export const JourneyManual: Story = {
  name: "The whole journey by hand",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyScreen policy="allowed" />,
};

/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { createSignal, Show } from "solid-js";

import type { AccountCommunityMembership } from "../../../api/account-community-memberships.ts";
import type { ActivePersonaPublicProjection } from "../../../api/session.ts";
import { ApplicationChrome } from "../../shell/media-shell/media-shell";
import { toneWavUrl } from "../../posts/video-submission/story-fixtures-media";
import { YourCommunitiesRouteView } from "./your-communities-route.tsx";

/** The connected create journey, from the footer's center + through community
 * choice, profile, song and the gated capture surface. Everything the server
 * would answer is stood in for — memberships, the posting session, the song
 * read, the excerpt preflight and the per-persona owner policy — because
 * Storybook has no session. Each story's play function asserts the flow
 * reached the state the story names, not merely that something rendered. */

const SONG_MS = 150_000;

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

const personas: readonly ActivePersonaPublicProjection[] = [
  { personaId: "persona-one", displayName: "Harbor Persona", avatarRef: null, primaryPublicHandle: "harbor.pirate", communityBinding: { communityId: "harbor", bindingSource: "first_membership" as const } },
  { personaId: "persona-two", displayName: "Night Persona", avatarRef: null, primaryPublicHandle: "night.pirate", communityBinding: { communityId: "harbor", bindingSource: "first_membership" as const } },
];

type PolicyFixture = "allowed" | "denied" | "failed-then-allowed";

function JourneyScreen(props: { readonly policy: PolicyFixture }) {
  // The + navigates to /communities?compose=video; Storybook has no router,
  // so the story holds the route and its query in its own state.
  const [onCommunities, setOnCommunities] = createSignal(false);
  const [intent, setIntent] = createSignal<"video" | undefined>(undefined);
  const session = createSignal({ status: "authenticated" as const, userId: "storybook-account" });
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
      mobileActiveItem="home"
      navigate={(href) => {
        if (href === "/communities?compose=video") {
          setOnCommunities(true);
          setIntent("video");
        }
      }}
      signedIn
    >
      <Show when={onCommunities()}>
        <YourCommunitiesRouteView
          applicationSession={session[0]}
          clearCreateIntent={() => setIntent(undefined)}
          createIntent={intent()}
          loadMemberships={async () => memberships}
          navigate={() => undefined}
          resolvePostingSession={async () => ({
            status: "authenticated" as const,
            userId: "storybook-account",
            personas,
          })}
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
          videoStorage={{ exclusive: async work => work(), load: async () => null, save: async () => {}, remove: async () => {} }}
          videoOpenPreview={async () => new MediaStream()}
          videoStartCapture={async () => ({
            stream: new MediaStream(),
            captureOriginMs: performance.now(),
            stop: async () => new File([new Blob(["storybook-take"])], "take.mp4", { type: "video/mp4" }),
            cancel: async () => {},
          })}
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
          "The connected create journey from the footer's center create action: community choice, profile, song, and the capture gate. The song's audio, the excerpt preflight and the per-persona owner policy are Storybook stand-ins; no story contacts a server.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

async function openComposerAndPickSong(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const create = await canvas.findByRole("button", { name: "Post a video" }, { timeout: 8_000 });
  create.click();
  await canvas.findByText("Choose a community for your video.");
  const row = canvasElement.querySelector("#community-harbor button:not([data-post-community-id])");
  expect(row).not.toBeNull();
  (row as HTMLButtonElement).click();
  // The composer opens in video mode on the song step; the community was
  // already chosen, so no community field is offered.
  const input = await canvas.findByLabelText("Search songs", undefined, { timeout: 8_000 }) as HTMLInputElement;
  expect(canvasElement.querySelector("input[name='community-id']")).toBeNull();
  // The profile choice is present in the video flow itself.
  await canvas.findByText("Posting as");
  input.value = "https://pirate.test/p/cadence-post";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const use = await within(canvasElement).findByText("Use the song at this link", undefined, { timeout: 8_000 });
  (use.closest("button") as HTMLButtonElement).click();
}

export const PlusToCaptureAllowed: Story = {
  name: "+ to capture, policy allows",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyScreen policy="allowed" />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("the footer's + opens the create entry", async () => {
      const create = await canvas.findByRole("button", { name: "Post a video" }, { timeout: 8_000 });
      create.click();
      await canvas.findByText("Choose a community for your video.");
    });
    await step("a community row is the choice", async () => {
      const row = canvasElement.querySelector("#community-harbor button:not([data-post-community-id])");
      expect(row).not.toBeNull();
      (row as HTMLButtonElement).click();
      await canvas.findByLabelText("Search songs", undefined, { timeout: 8_000 });
    });
    await step("a song is chosen and capture opens once accepted", async () => {
      const input = canvas.getByLabelText("Search songs") as HTMLInputElement;
      input.value = "https://pirate.test/p/cadence-post";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const use = await canvas.findByText("Use the song at this link", undefined, { timeout: 8_000 });
      (use.closest("button") as HTMLButtonElement).click();
      // The assertion is on the settled screen, not the moment the button
      // first appears: the preview fixture keeps the camera state stable
      // where a real permission failure would collapse it.
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
    await openComposerAndPickSong(canvasElement);
    const denial = await canvas.findByText(/This profile can’t post a video to this song/, undefined, { timeout: 12_000 });
    expect(denial).toBeTruthy();
    expect(canvas.queryByLabelText("Start recording")).toBeNull();
    await canvas.findByText("Change song");
  },
};

export const PlusFailedRead: Story = {
  name: "+ through an unreadable policy and a retry",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyScreen policy="failed-then-allowed" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openComposerAndPickSong(canvasElement);
    const retry = await canvas.findByText("Try the check again", undefined, { timeout: 12_000 });
    (retry.closest("button") as HTMLButtonElement).click();
    await canvas.findByLabelText("Start recording", undefined, { timeout: 12_000 });
    await new Promise(resolve => setTimeout(resolve, 800));
    expect(canvas.queryByText("Recording is not supported here")).toBeNull();
  },
};

/** The same journey with no play function, so a reviewer walks it by hand:
 * the footer's +, the community row, the pasted song link, the excerpt, the
 * profile switch, and the record and stop controls. */
export const JourneyManual: Story = {
  name: "The whole journey by hand",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <JourneyScreen policy="allowed" />,
};

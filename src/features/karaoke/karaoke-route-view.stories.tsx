import { createRouter, memoryHistory } from "@solidjs/router";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import type { SessionResolution } from "../../api/session";

import type { ApiKaraokeSession } from "./karaoke-session-bridge";
import { KaraokeApiError } from "./karaoke-session-bridge";
import { KaraokeLeaderboardRouteView, KaraokeSessionRouteView } from "./karaoke-route-view";
import type { KaraokeScoringState } from "./scoring/karaoke-scoring-controller";
import type { UseKaraokeScoringOptions, UseKaraokeScoringResult } from "./scoring/use-karaoke-scoring-session";
import {
  storyKaraokeClient,
  storyLeaderboard,
  storyPayload,
  storyPostId,
} from "./karaoke-story-fixtures";

// The route views call useNavigate, so stories mount them under an in-memory
// router. Navigation writes to memory history only — no browser URL, no
// network.
const StoryRouter = createRouter({
  history: memoryHistory(),
  routes: [{ path: "/" }],
});

const meta = {
  title: "Screens/Karaoke/Route",
  decorators: [(Story) => <StoryRouter>{() => <Story />}</StoryRouter>],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Karaoke route views driven by a stubbed KaraokeApiClient, mirroring the mocked-API approach in karaoke-api.test.ts and karaoke-route-model.test.ts. No story reaches fetch, the mic, or a WebSocket; session creation records its input and stays pending so even an accidental Start singing click cannot escape the seam.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const sessionCreations: Array<{ communityId: string; postId: string; idempotencyKey: string }> = [];

const sessionClient = storyKaraokeClient({
  createSession: (input) => {
    sessionCreations.push(input);
    return new Promise<ApiKaraokeSession>(() => {});
  },
});

/** A signed-in singer with a persona bound to the song's community. */
const storySinger = async (): Promise<SessionResolution> => ({ status: "authenticated", userId: "story-account", personas: [{
  personaId: "story-persona", displayName: "Singer", avatarRef: null, primaryPublicHandle: null,
  communityBinding: { communityId: storyPayload.community!, bindingSource: "first_membership" },
}] });

export const SessionLoaded: Story = {
  render: () => <KaraokeSessionRouteView client={sessionClient} postId={storyPostId} resolveSession={storySinger} />,
  parameters: {
    docs: {
      description: {
        story:
          "Practice route with a mocked payload carrying timed lines and a community, so the Start singing affordance renders. Session creation is stubbed at the KaraokeApiClient seam (recorded and never settled).",
      },
    },
  },
};

export const SessionPayloadFailure: Story = {
  render: () => (
    <KaraokeSessionRouteView
      client={storyKaraokeClient({
        getPayload: async () => {
          throw new KaraokeApiError("karaoke_api_error", "Karaoke request failed (500)", 500);
        },
      })}
      postId={storyPostId}
    />
  ),
};

export const LeaderboardLoaded: Story = {
  render: () => (
    <KaraokeLeaderboardRouteView
      client={storyKaraokeClient({
        getLeaderboard: async () => storyLeaderboard,
      })}
      postId={storyPostId}
    />
  ),
};

export const LeaderboardLoading: Story = {
  render: () => (
    <KaraokeLeaderboardRouteView
      client={storyKaraokeClient({
        getPayload: () => new Promise(() => {}),
      })}
      postId={storyPostId}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "The payload request never settles, pinning the route on its loading state.",
      },
    },
  },
};

export const LeaderboardAuthRequired: Story = {
  render: () => (
    <KaraokeLeaderboardRouteView
      client={storyKaraokeClient({
        getPayload: async () => storyPayload,
        getLeaderboard: async () => {
          throw new KaraokeApiError("auth_error", "Sign in required", 401);
        },
      })}
      postId={storyPostId}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "A 401 from the leaderboard endpoint flips the route to the sign-in state.",
      },
    },
  },
};

export const LeaderboardLoadFailure: Story = {
  render: () => (
    <KaraokeLeaderboardRouteView
      client={storyKaraokeClient({
        getLeaderboard: async () => {
          throw new KaraokeApiError("karaoke_api_error", "Karaoke request failed (500)", 500);
        },
      })}
      postId={storyPostId}
    />
  ),
};

// The first-use recording notice is a local acknowledgment (see
// karaoke-route-view.tsx). Each story below sets it as it needs and puts the
// viewer's own value back afterwards.
const MIC_DISCLOSURE_KEY = "karaoke:microphone-disclosure:v1";

function withMicDisclosure(acknowledged: boolean) {
  return () => {
    let previous: string | null = null;
    try {
      previous = localStorage.getItem(MIC_DISCLOSURE_KEY);
      if (acknowledged) localStorage.setItem(MIC_DISCLOSURE_KEY, "1");
      else localStorage.removeItem(MIC_DISCLOSURE_KEY);
    } catch {
      // Storage unavailable: the route treats the notice as unacknowledged.
    }
    return () => {
      try {
        if (previous === null) localStorage.removeItem(MIC_DISCLOSURE_KEY);
        else localStorage.setItem(MIC_DISCLOSURE_KEY, previous);
      } catch {
        // Nothing to restore.
      }
    };
  };
}

/**
 * A scoring controller double at the route's createScoring seam: Start
 * records the call and, when given a microphone failure, reports it the way
 * the real controller does. No microphone or socket is touched.
 */
function storyScoring(start: () => void, micError?: "permission_denied" | "no_device") {
  return (options: UseKaraokeScoringOptions): UseKaraokeScoringResult => {
    const [state, setState] = createSignal<KaraokeScoringState | null>(null);
    return {
      enabled: () => options.enabled,
      playbackInterrupted: () => false,
      state,
      controls: {
        start: () => {
          start();
          if (micError === undefined) return;
          setState({
            status: "error", phase: "capture_failed", lineScores: [], latestLineId: null,
            partialTranscript: "", summary: null, error: null,
            micError: { code: micError, message: "Capture failed" },
          });
        },
        noteFinish() {}, notePause() {}, notePlay() {}, noteSeek() {}, noteTime() {}, stop() {}, abort() {},
      },
    };
  };
}

/** Waits for the singer's profiles to load, then presses Start karaoke. */
async function pressStart(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const start = await canvas.findByRole("button", { name: "Start karaoke" });
  await new Promise(resolve => setTimeout(resolve, 0));
  await userEvent.click(start);
}

const recordingNoticeStart = fn();

/** First scored take: the recording notice comes before the microphone. Cancel leaves it unrecorded. */
export const RecordingNotice: Story = {
  beforeEach: withMicDisclosure(false),
  render: () => <KaraokeSessionRouteView client={sessionClient} postId={storyPostId} resolveSession={storySinger}
    createScoring={storyScoring(recordingNoticeStart)} />,
  play: async ({ canvasElement }) => {
    recordingNoticeStart.mockClear();
    await pressStart(canvasElement);
    const notice = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Recording disclosure" });
    const dialog = within(notice);
    await expect(dialog.getByRole("heading", { name: "Before you record" })).toBeVisible();
    await expect(notice).toHaveTextContent("ElevenLabs");
    await expect(dialog.getByRole("button", { name: "Continue to record" })).toBeVisible();
    await expect(recordingNoticeStart).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(notice).not.toBeInTheDocument());
    await expect(recordingNoticeStart).not.toHaveBeenCalled();
  },
};

const micStart = fn();

/** The browser refused the microphone: the take explains it and Start stays available. */
export const MicBlocked: Story = {
  beforeEach: withMicDisclosure(true),
  render: () => <KaraokeSessionRouteView client={sessionClient} postId={storyPostId} resolveSession={storySinger}
    createScoring={storyScoring(micStart, "permission_denied")} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await pressStart(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Microphone access is blocked. Allow microphone access in your browser and try again.",
    );
    await expect(canvas.getByRole("button", { name: "Start karaoke" })).toBeEnabled();
  },
};

/** No microphone is connected. */
export const NoMic: Story = {
  beforeEach: withMicDisclosure(true),
  render: () => <KaraokeSessionRouteView client={sessionClient} postId={storyPostId} resolveSession={storySinger}
    createScoring={storyScoring(micStart, "no_device")} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await pressStart(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "No microphone is available. Connect a microphone and try again.",
    );
    await expect(canvas.getByRole("button", { name: "Start karaoke" })).toBeEnabled();
  },
};

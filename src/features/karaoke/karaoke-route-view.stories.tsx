import { createRouter, memoryHistory } from "@solidjs/router";
import { expect, within } from "storybook/test";
import { expectFitsViewport } from "../../stories/viewport-story-helpers";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { ApiKaraokeSession } from "./karaoke-session-bridge";
import { KaraokeApiError } from "./karaoke-session-bridge";
import { KaraokeLeaderboardRouteView, KaraokeSessionRouteView } from "./karaoke-route-view";
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

export const SessionLoaded: Story = {
  render: () => <KaraokeSessionRouteView client={sessionClient} postId={storyPostId}
    resolveSession={async () => ({ status: "authenticated", userId: "story-account", personas: [{
      personaId: "story-persona", displayName: "Singer", avatarRef: null, primaryPublicHandle: null,
      communityBinding: { communityId: storyPayload.community!, bindingSource: "first_membership" },
    }] })}
  />,
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

export const SessionSignedOut: Story = {
  render: () => <KaraokeSessionRouteView client={storyKaraokeClient()} postId={storyPostId} resolveSession={async () => "anonymous"} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Sign in to sing" })).toBeInTheDocument();
    await expect(canvas.getByText("I don't know why", { exact: true })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Start karaoke" })).toBeNull();
    await expectFitsViewport(canvasElement);
  },
};

export const SessionSignedOutMobile: Story = {
  ...SessionSignedOut,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

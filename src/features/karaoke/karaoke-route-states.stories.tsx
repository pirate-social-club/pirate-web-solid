import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  KaraokeAuthRequiredState,
  KaraokeRouteLoadFailureState,
  KaraokeRouteLoadingState,
} from "./karaoke-route-states";

const meta = {
  title: "Screens/Karaoke/RouteStates",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Route-level states the karaoke routes render while the payload or leaderboard is in flight, failed, or gated behind sign-in. The copy matches karaoke-route-view.tsx.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => <KaraokeRouteLoadingState label="Loading karaoke" />,
};

export const LoadFailure: Story = {
  render: () => (
    <KaraokeRouteLoadFailureState
      description="We couldn't load karaoke for this song."
      onGoHome={() => {}}
      onRetry={() => {}}
      title="Karaoke unavailable"
    />
  ),
};

export const AuthRequired: Story = {
  render: () => (
    <KaraokeAuthRequiredState
      ctaLabel="Sign in"
      description="This song is available to everyone, but recording a scored take requires an account."
      onConnect={() => {}}
      onExit={() => {}}
      title="Sign in to sing"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Shown when session creation answers 401 after Start singing, or when the signed-out visitor opens the leaderboard route.",
      },
    },
  },
};

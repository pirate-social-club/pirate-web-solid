import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  StudyAuthRequiredState,
  StudyRouteLoadFailureState,
  StudyRouteLoadingState,
} from "./studying-route-states";

const meta = {
  title: "Screens/Studying/RouteStates",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Route-level states the studying route renders while the lesson payload is in flight, failed, or gated behind sign-in. The copy matches studying-route-view.tsx.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => <StudyRouteLoadingState label="Loading study" />,
};

export const LoadFailure: Story = {
  render: () => (
    <StudyRouteLoadFailureState
      description="We couldn't load this study session."
      onGoHome={() => {}}
      onRetry={() => {}}
      title="Study unavailable"
    />
  ),
};

export const AuthRequired: Story = {
  render: () => (
    <StudyAuthRequiredState
      ctaLabel="Sign in"
      description="Study packs follow the song's community. Sign in to pick up your lesson and streak."
      onConnect={() => {}}
      title="Sign in to study"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Shown when the lesson load or an attempt submission answers 401/403 — the study pack is member-only and never falls back to a public read.",
      },
    },
  },
};

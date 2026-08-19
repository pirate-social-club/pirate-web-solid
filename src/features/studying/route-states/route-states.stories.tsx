import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  RouteLoadFailureState,
  RouteLoadingState,
} from "../../../design-system";

const meta = {
  title: "App/Studying/RouteStates",
  parameters: {
    docs: {
      description: {
        component:
          "Studying route loading and load-failure states. Auth-gated behavior is covered by App/Studying/RouteView/AuthRequired so the catalog does not duplicate the generic auth screen.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => <RouteLoadingState height="public" label="Loading study" />,
};

export const LoadFailure: Story = {
  render: () => (
    <RouteLoadFailureState
      description="We couldn't load this study session."
      onGoHome={() => {}}
      onRetry={() => {}}
      title="Study unavailable"
    />
  ),
};

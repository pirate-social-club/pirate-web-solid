import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "@/components/actions/button/button";

import {
  AuthRequiredRouteState,
  EmptyFeedState,
  EmptyInboxState,
  ErrorState,
  FullPageSpinner,
  NotFoundRouteState,
  RootAppErrorState,
  RouteLoadFailureState,
  RouteLoadingState,
  RouteMessageState,
} from "./route-states";

// Offline mascot fixture: a simple ghost glyph in place of the app mascot
// artwork referenced by the production defaults.
const fixtureGhostSvg = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#e2e8f0"/><circle cx="24" cy="28" r="4" fill="#334155"/><circle cx="40" cy="28" r="4" fill="#334155"/><path d="M22 42q10 8 20 0" stroke="#334155" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
)}`;

const fixtureGhostImage = {
  alt: "Fixture ghost",
  src: fixtureGhostSvg,
  srcSet: fixtureGhostSvg,
};

const meta = {
  title: "Patterns/Feedback/RouteStates",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Route-level loading, empty, error, not-found, and auth-required screens. All recovery actions are callbacks and all copy is props; the React versions navigated and read the auth runtime directly, so the Solid ports take onGoHome/onRetry/onConnect and an authState prop. Stories pass an inline ghost fixture instead of the production /mascots artwork.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const RouteLoading: Story = {
  render: () => <RouteLoadingState label="Loading route" />,
};

export const PublicRouteLoading: Story = {
  render: () => <RouteLoadingState height="public" />,
};

export const PublicRouteMessage: Story = {
  render: () => (
    <RouteMessageState
      title="Privacy"
      description="This static page renders a plain message state."
    />
  ),
};

export const RouteMessage: Story = {
  render: () => <RouteMessageState title="Privacy" description="This route-neutral state is context-free." />,
};

export const EmptyFeed: Story = {
  render: () => <EmptyFeedState message="No posts yet. Check back later." />,
};

export const EmptyFeedMobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <EmptyFeedState message="No posts yet. Check back later." />,
};

export const AuthRequired: Story = {
  render: () => (
    <AuthRequiredRouteState
      description="Sign in to view your inbox."
      title="Inbox"
    />
  ),
};

export const AuthRequiredLoading: Story = {
  render: () => (
    <AuthRequiredRouteState
      authState="loading"
      description="Sign in to view your inbox."
      title="Inbox"
    />
  ),
};

export const AuthRequiredUnavailable: Story = {
  render: () => (
    <AuthRequiredRouteState
      authState="unavailable"
      description="Sign in to view your inbox."
      title="Inbox"
    />
  ),
};

export const AuthRequiredWithIllustration: Story = {
  render: () => (
    <AuthRequiredRouteState
      ctaLabel="Connect"
      description="Get notified when someone replies, mentions you, or sends a tip."
      headline="Your inbox is waiting"
      illustration={<EmptyInboxState class="py-0" image={fixtureGhostImage} />}
      onConnect={() => {}}
      title="Inbox"
    />
  ),
};

export const AuthRequiredMobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <AuthRequiredRouteState
      ctaLabel="Connect"
      description="Get notified when someone replies, mentions you, or sends a tip."
      headline="Your inbox is waiting"
      illustration={<EmptyInboxState class="py-0" image={fixtureGhostImage} />}
      onConnect={() => {}}
      title="Inbox"
    />
  ),
};

export const Error: Story = {
  render: () => (
    <ErrorState
      image={fixtureGhostImage}
      action={
        <div class="flex w-full flex-row gap-3">
          <Button class="h-12 flex-1" size="lg">Try Again</Button>
          <Button class="h-12 flex-1" size="lg" variant="secondary">Go Home</Button>
        </div>
      }
      description="We could not load this page. It may have been removed or you may be offline."
      title="Something went wrong?"
    />
  ),
};

export const ErrorMobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <ErrorState
      image={fixtureGhostImage}
      action={
        <div class="flex w-full flex-row gap-3">
          <Button class="h-12 flex-1" size="lg">Try Again</Button>
          <Button class="h-12 flex-1" size="lg" variant="secondary">Go Home</Button>
        </div>
      }
      description="We could not load this page. It may have been removed or you may be offline."
      title="Something went wrong?"
    />
  ),
};

export const FullPageLoading: Story = {
  render: () => <FullPageSpinner />,
};

export const NotFound: Story = {
  render: () => <NotFoundRouteState path="/missing" />,
};

export const NotFoundMobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <NotFoundRouteState path="/missing" />,
};

export const RouteLoadFailure: Story = {
  render: () => (
    <RouteLoadFailureState
      title="Something went wrong?"
      description="We could not load this page. It may have been removed or you may be offline."
    />
  ),
};

export const RouteLoadFailureMobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <RouteLoadFailureState title="Something went wrong?" description="Failed to fetch" />
  ),
};

export const RootAppError: Story = {
  render: () => (
    <RootAppErrorState
      title="Something went wrong?"
      description="The app failed to initialize. Please try reloading the page."
      homeLabel="Go Home"
    />
  ),
};

export const RootAppErrorMobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <RootAppErrorState
      title="Something went wrong?"
      description="The app failed to initialize. Please try reloading the page."
      homeLabel="Go Home"
    />
  ),
};

export const EmptyInbox: Story = {
  name: "Empty Inbox",
  render: () => <EmptyInboxState image={fixtureGhostImage} description="No notifications" />,
};

export const EmptyInboxWithTitle: Story = {
  name: "Empty Inbox / With Title",
  render: () => (
    <EmptyInboxState
      image={fixtureGhostImage}
      title="All caught up!"
      description="You have no new notifications right now."
    />
  ),
};

export const EmptyInboxMobile: Story = {
  name: "Empty Inbox / Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <EmptyInboxState image={fixtureGhostImage} description="No notifications" />,
};

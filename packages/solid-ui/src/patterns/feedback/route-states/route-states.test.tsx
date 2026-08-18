import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import {
  AuthRequiredRouteState,
  EmptyInboxState,
  FullPageSpinner,
  NotFoundRouteState,
  RouteLoadingState,
  RouteMessageState,
  RouteLoadFailureState,
} from "./route-states";

const fixtureGhostImage = {
  alt: "Fixture ghost",
  src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
  srcSet: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
};

describe("route states", () => {
  it("exposes accessible route loading states and retained public aliases", () => {
    const route = render(() => <RouteLoadingState label="Loading inbox" />);
    const status = within(route).getByRole("status", { name: "Loading inbox" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveClass("min-h-[40vh]");
    expect(within(status).queryByLabelText("Loading")).toBeNull();

    const publicRoute = render(() => <RouteLoadingState height="public" label="Loading public" />);
    expect(within(publicRoute).getByRole("status", { name: "Loading public" })).toHaveClass("min-h-[60vh]");
  });

  it("provides a route-neutral message state", () => {
    const container = render(() => <RouteMessageState title="Privacy" description="Static page" />);
    expect(within(container).getByRole("heading", { name: "Privacy" })).toBeVisible();
    expect(within(container).getByText("Static page")).toBeVisible();
  });

  it("renders the not-found state with the interpolated path", () => {
    const container = render(() => <NotFoundRouteState path="/missing" />);

    expect(within(container).getByText(/could not find \/missing/)).toBeVisible();
    expect(within(container).getByRole("button", { name: "Back to home" })).toBeVisible();
  });

  it("fires retry and go-home callbacks from the load-failure state", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const container = render(() => (
      <RouteLoadFailureState
        title="Something went wrong?"
        description="Failed to fetch"
        onGoHome={() => calls.push("home")}
        onRetry={() => calls.push("retry")}
      />
    ));

    await user.click(within(container).getByRole("button", { name: "Try Again" }));
    await user.click(within(container).getByRole("button", { name: "Go Home" }));
    expect(calls).toEqual(["retry", "home"]);
  });

  it("shows the spinner while auth loads", () => {
    const container = render(() => (
      <AuthRequiredRouteState authState="loading" description="Sign in." title="Inbox" />
    ));

    expect(within(container).queryByText("Inbox")).toBeNull();
  });

  it("shows the warning card when auth is unavailable", () => {
    const container = render(() => (
      <AuthRequiredRouteState
        authState="unavailable"
        description="Sign in to view your inbox."
        title="Inbox"
      />
    ));

    expect(within(container).getByText("Authentication unavailable")).toBeVisible();
  });

  it("shows the connect CTA when ready and wires onConnect", async () => {
    const user = userEvent.setup();
    let connects = 0;
    const container = render(() => (
      <AuthRequiredRouteState
        description="Sign in to view your inbox."
        illustration={<EmptyInboxState image={fixtureGhostImage} />}
        onConnect={() => (connects += 1)}
        title="Inbox"
      />
    ));

    await user.click(within(container).getByRole("button", { name: "Connect" }));
    expect(connects).toBe(1);
  });

  it("renders the full-page spinner", () => {
    const container = render(() => <FullPageSpinner />);

    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("has no automated a11y violations", async () => {
    render(() => <NotFoundRouteState path="/missing" />);

    await expectNoA11yViolations();
  });
});

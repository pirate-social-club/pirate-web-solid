import { ApiClientError } from "@pirate/api-client";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CommunityNamespaceSettingsApiError } from "./community-namespace-settings-api";
import { CommunityNamespaceSettingsController } from "./community-namespace-settings-controller";

const disposers: Array<() => void> = [];
function render(ui: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((rootDispose) => { dispose = rootDispose; solidRender(ui, container); });
  disposers.push(() => { dispose(); container.remove(); });
  return { container };
}
beforeEach(() => { vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); });
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** A failure exactly as the generated client builds it from an API response. */
function apiFailure(
  status: number,
  code: string,
  options: { readonly requestId?: string; readonly retryable?: boolean } = {},
) {
  // SAFETY: The exact error definition shape the generated client constructs
  // an ApiClientError from; only the fields this suite asserts on are set.
  const definition = { name: code, status } as never;
  // SAFETY: The exact error body shape the generated client parses, including
  // the `request_id` field this suite is about.
  const body = {
    error: { code, message: "server message that must not be shown", retryable: options.retryable ?? false },
    ...(options.requestId === undefined ? {} : { request_id: options.requestId }),
  } as never;
  return new ApiClientError(definition, body);
}

const ready = {
  community_id: "community-1",
  family: "hns" as const,
  generation: 1,
  root_label: "midnight",
  next_action: { kind: "start_verification" as const, family: "hns" as const, root_label: "midnight" },
};

function renderFailing(failure: unknown) {
  const execute = vi.fn(async () => { throw failure; });
  const { container } = render(() => (
    <CommunityNamespaceSettingsController
      api={{ read: async () => ready, execute }}
      communityId="community-1"
      communityPath="/c/community-1"
    />
  ));
  const start = async () => {
    await vi.waitFor(() => expect(container.textContent).toContain("Start verification"));
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Start verification")!.click();
  };
  return { container, execute, start };
}

const reference = (container: HTMLElement) =>
  container.querySelector('[data-testid="namespace-failure-reference"]')?.textContent ?? null;

test("shows the reference the API returned with an opaque failure", async () => {
  const { container, start } = renderFailing(
    apiFailure(500, "internal_error", { requestId: "1f6f0f5a-2d0f-4f7e-9d16-6b3c8a5c4d21" }),
  );
  await start();

  await vi.waitFor(() => expect(container.textContent).toContain("That HNS address step could not be completed."));
  expect(reference(container)).toBe("1f6f0f5a-2d0f-4f7e-9d16-6b3c8a5c4d21");
  expect(container.textContent).toContain("Reference");
});

test("shows nothing extra when the failure carries no reference", async () => {
  const { container, start } = renderFailing(apiFailure(500, "internal_error"));
  await start();

  await vi.waitFor(() => expect(container.textContent).toContain("That HNS address step could not be completed."));
  expect(reference(container)).toBeNull();
  expect(container.textContent).not.toContain("Reference");
});

test("keeps a mapped failure's own wording and still offers its reference", async () => {
  const { container, start } = renderFailing(apiFailure(429, "rate_limited", { requestId: "request-429" }));
  await start();

  await vi.waitFor(() => expect(container.textContent).toContain("Too many requests. Wait a moment before trying again."));
  expect(reference(container)).toBe("request-429");
  expect(container.textContent).not.toContain("That HNS address step could not be completed.");
});

test("never shows the server's own failure text", async () => {
  const { container, start } = renderFailing(apiFailure(500, "internal_error", { requestId: "request-500" }));
  await start();

  await vi.waitFor(() => expect(reference(container)).toBe("request-500"));
  expect(container.textContent).not.toContain("server message that must not be shown");
});

test("offers no reference for a failure raised inside the adapter", async () => {
  const { container, start } = renderFailing(
    new CommunityNamespaceSettingsApiError("The HNS verification session is missing."),
  );
  await start();

  await vi.waitFor(() => expect(container.textContent).toContain("The HNS verification session is missing."));
  expect(reference(container)).toBeNull();
});

test("drops the reference once a later command succeeds", async () => {
  let failNext = true;
  const execute = vi.fn(async () => {
    if (failNext) {
      failNext = false;
      throw apiFailure(500, "internal_error", { requestId: "request-stale" });
    }
    return { ...ready, generation: 2 };
  });
  const { container } = render(() => (
    <CommunityNamespaceSettingsController
      api={{ read: async () => ready, execute }}
      communityId="community-1"
      communityPath="/c/community-1"
    />
  ));
  const click = async () => {
    await vi.waitFor(() => expect(container.textContent).toContain("Start verification"));
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Start verification")!.click();
  };

  await click();
  await vi.waitFor(() => expect(reference(container)).toBe("request-stale"));

  await click();
  await vi.waitFor(() => expect(reference(container)).toBeNull());
  expect(container.textContent).not.toContain("Reference");
});

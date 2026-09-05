import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { createCommunityNamespaceSettingsApi } from "./community-namespace-settings-api";
import { CommunityNamespaceSettingsController } from "./community-namespace-settings-controller";

const disposers: Array<() => void> = [];
function render(ui: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((rootDispose) => { dispose = rootDispose; solidRender(ui, container); });
  const cleanup = () => { dispose(); container.remove(); };
  disposers.push(cleanup);
  return { container, cleanup };
}
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const session = {
  attachment_intent_id: "attachment-1", community_id: "community-1", expires_at: "2099-09-11T00:00:00.000Z",
  replayed: false, root_import_session_id: "session-1", root_label: "midnight", revision: 3,
  status: "awaiting_owner_update", publication_check_pending: false,
  publish_plan: { replacement_records: [{ type: "NS", ns: "ns1.midnight" }] },
  publish_plan_sha256: "plan-hash", readiness_result_sha256: null, retry_after_seconds: 2,
};
type DiscoveryFixture = {
  community_id: string;
  attachment: null | { canonical_route: { root_label_display: string }; status: string };
  session: typeof session | null;
};
function makeApi(read: () => Promise<DiscoveryFixture>, poll = vi.fn(async () => ({ ...session, publication_check_pending: true }))) {
  return createCommunityNamespaceSettingsApi({
    // SAFETY: These fakes supply the generated discovery and poll response fields exercised here.
    client: { get_communitiesCommunityIdHnsRootImports: read,
      post_communitiesCommunityIdHnsRootImportsSessionIdPoll: poll } as never,
    communityId: "community-1", communityPath: "/c/community-1", readCsrfToken: () => "csrf-1",
    locator: { read: () => null, write: () => {}, clear: () => {} },
  });
}

test.each([2, 90])("pending checks honor a %i second interval and stop on disposal", async (retrySeconds) => {
  const poll = vi.fn(async () => ({ ...session, publication_check_pending: true, retry_after_seconds: retrySeconds }));
  const api = makeApi(async () => ({ community_id: "community-1", attachment: null, session }), poll);
  const { container, cleanup } = render(() => <CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
  await vi.waitFor(() => expect(container.textContent).toContain("I published all records manually"));
  vi.useFakeTimers();
  const acknowledge = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "I published all records manually");
  acknowledge!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(poll).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Checking records");
  expect(container.textContent).not.toContain("I published all records manually");
  expect(container.textContent).not.toContain("Activate community address");
  await vi.advanceTimersByTimeAsync(retrySeconds * 1000 - 1);
  expect(poll).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(poll).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(retrySeconds * 1000);
  expect(poll).toHaveBeenCalledTimes(3);
  cleanup();
  await vi.advanceTimersByTimeAsync(retrySeconds * 5000);
  expect(poll).toHaveBeenCalledTimes(3);
});

test("fresh controllers recover pending imports after navigation and reload without a locator", async () => {
  const discovery = vi.fn(async () => ({ community_id: "community-1", attachment: null,
    session: { ...session, publication_check_pending: true } }));
  for (let visit = 0; visit < 3; visit += 1) {
    const api = makeApi(discovery);
    const { container, cleanup } = render(() => <CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
    await vi.waitFor(() => expect(container.textContent).toContain("Checking records"));
    expect(container.textContent).not.toContain("Handshake root");
    cleanup();
  }
  expect(discovery).toHaveBeenCalledTimes(3);
});

test.each([null, { canonical_route: { root_label_display: "midnight" }, status: "suspended" }])(
  "renders only the asserted attachment and account absence %j", async (attachment) => {
    const api = makeApi(async () => ({ community_id: "community-1", attachment, session: null }));
    const { container } = render(() => <CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
    await vi.waitFor(() => expect(container.textContent).toContain("No import found for your account."));
    expect(container.querySelector("[data-namespace-attachment]") !== null).toBe(attachment !== null);
    if (attachment !== null) {
      expect(container.textContent).toContain("midnight");
      expect(container.textContent).toContain("This attachment is suspended.");
    }
    expect(container.textContent).not.toContain("another operator");
    expect(container.textContent).not.toContain("Accessible");
  },
);

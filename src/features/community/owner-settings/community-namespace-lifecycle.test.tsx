import { ApiClientError } from "@pirate/api-client";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createCommunityNamespaceSettingsApi } from "./community-namespace-settings-api";
import { CommunityNamespaceSettingsController } from "./community-namespace-settings-controller";

/**
 * What the owner sees is what the server decided.
 *
 * The lifecycle block is the server's own phase, deadline, next-check time and
 * observation evidence. Before it existed the client had only the coarse
 * session status and had to guess the rest, which is how a waiting name could
 * be presented as a failed one. These drive the real controller against a fake
 * transport and assert the phase — not the status — decides what is rendered
 * and what the owner is offered, that a response without the block still
 * renders, that a reload reflects what the server changed, and that an expired
 * sign-in is reported as authentication rather than as a name problem.
 */

const disposers: Array<() => void> = [];
function render(ui: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((rootDispose) => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return { container };
}

beforeEach(() => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

type PlanRecord = { type: string; ns?: string; txt?: ReadonlyArray<string> };

const emptyRecords = (): PlanRecord[] => [];
const emptyStrings = (): string[] => [];

const planRecords: PlanRecord[] = [
  { type: "NS", ns: "ns1.pirate." },
  { type: "NS", ns: "ns2.pirate." },
  { type: "TXT", txt: ["pirate-verification=session-1"] },
];

const session = {
  attachment_intent_id: "attachment-1",
  community_id: "community-1",
  expires_at: "2099-09-11T00:00:00.000Z",
  replayed: false,
  root_import_session_id: "session-1",
  root_label: "midnight",
  revision: 3,
  status: "awaiting_owner_update",
  publication_check_pending: false,
  publish_plan: {
    added_records: planRecords,
    // SAFETY: these lists are empty in the base fixture and populated per case;
    // the annotations keep them from inferring as `never[]` and rejecting the
    // records a case adds.
    current_records: emptyRecords(),
    preserved_records: emptyRecords(),
    preserved_unknown_record_types: emptyStrings(),
    removed_conflicts: emptyRecords(),
    replacement_records: planRecords,
    replacement_semantics: "complete_resource",
    acknowledgement_required: true,
    version: "pirate-hns-root-import-publish-plan-v1",
  },
  publish_plan_sha256: "2".repeat(64),
  readiness_result_sha256: null,
  retry_after_seconds: 5,
};

/** The wire block, as the deployed API emits it. */
type LifecycleBlock = {
  deadline: { at: string; kind: "publication" | "finality" } | null;
  next_check_at: string | null;
  observation: {
    view: "current" | "safe";
    resource_sha256: string;
    tip_height: number;
    update_inclusion_height: number | null;
    commitment_height: number | null;
  } | null;
  pending_reason: string | null;
  permitted_actions: ReadonlyArray<string>;
  phase: string;
  retry_hint_seconds: number | null;
  server_time: string;
};

type SessionFixture = typeof session & { lifecycle?: LifecycleBlock };
type DiscoveryFixture = {
  community_id: string;
  attachment: null;
  session: SessionFixture;
};

function lifecycleFixture(phase: string, overrides: Partial<LifecycleBlock> = {}): LifecycleBlock {
  return {
    deadline: null,
    next_check_at: null,
    observation: null,
    pending_reason: null,
    permitted_actions: ["poll"],
    phase,
    retry_hint_seconds: null,
    server_time: "2026-09-10T12:00:00.000Z",
    ...overrides,
  };
}

/** The real API adapter over a fake transport, so the mapping is exercised. */
function makeApi(
  read: () => Promise<DiscoveryFixture>,
  get: () => Promise<SessionFixture> = vi.fn(async () => session),
) {
  return createCommunityNamespaceSettingsApi({
    // SAFETY: these fakes implement exactly the generated methods exercised here.
    client: {
      get_communitiesCommunityIdHnsRootImports: read,
      get_communitiesCommunityIdHnsRootImportsSessionId: get,
      post_communitiesCommunityIdHnsRootImportsSessionIdPoll: vi.fn(),
    } as never,
    communityId: "community-1",
    communityPath: "/c/community-1",
    readCsrfToken: () => "csrf-1",
    locator: { read: () => null, write: () => {}, clear: () => {} },
  });
}

const mount = (api: ReturnType<typeof makeApi>) =>
  render(() => (
    <CommunityNamespaceSettingsController
      api={api}
      communityId="community-1"
      communityPath="/c/community-1"
    />
  ));

test("the server's phase decides what is rendered, not the coarse status", async () => {
  // The session status says the owner still has records to publish. The
  // lifecycle says the server has accepted them and is waiting for Handshake
  // to settle. The phase wins, because it is the decision the server made.
  const api = makeApi(async () => ({
    community_id: "community-1",
    attachment: null,
    session: {
      ...session,
      lifecycle: lifecycleFixture("waiting_safe_commitment", {
        deadline: { at: "2026-09-11T11:50:00.000Z", kind: "finality" },
        next_check_at: "2026-09-10T12:15:00.000Z",
        pending_reason: "waiting_safe_commitment",
        retry_hint_seconds: 900,
      }),
    },
  }));
  vi.useFakeTimers();
  const { container } = mount(api);
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("Waiting for tree commitment");
  expect(container.textContent).not.toContain("Publish these 3 records");
});

test("a response without the lifecycle block still renders the coarse states", async () => {
  const api = makeApi(async () => ({
    community_id: "community-1",
    attachment: null,
    session,
  }));
  vi.useFakeTimers();
  const { container } = mount(api);
  await vi.advanceTimersByTimeAsync(0);
  // The deployed API may omit the block entirely. Omission must degrade to the
  // status-driven rendering, never to an error or an empty panel.
  expect(container.textContent).toContain("Publish these 3 records");
  expect(container.textContent).not.toContain("Waiting for tree commitment");
});

test("recovery is reported as the server's decision, and offers the owner nothing to press", async () => {
  const api = makeApi(async () => ({
    community_id: "community-1",
    attachment: null,
    session: {
      ...session,
      lifecycle: lifecycleFixture("recovery_required", {
        deadline: { at: "2026-09-24T11:00:00.000Z", kind: "publication" },
        pending_reason: "publication_deadline_reached",
        permitted_actions: ["poll", "recover"],
      }),
    },
  }));
  vi.useFakeTimers();
  const { container } = mount(api);
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("This name needs attention");
  expect(container.textContent).toContain("window to publish these records has passed");
  // The assurance is bounded by what retained application state proves: the
  // authority setup is retained. It claims nothing about the owner's name or
  // its DNS records, which this state does not establish.
  expect(container.textContent).toContain(
    "We're retaining its authority setup while recovery is reviewed",
  );
  expect(container.textContent).not.toContain("DNS setup are untouched");
  expect(container.textContent).toContain("Publication deadline");
  // A deadline that has passed is not a failure, and nothing here offers to
  // restart: recovery is the server's decision to make.
  expect(container.textContent).not.toContain("Verification failed");
  expect(
    [...container.querySelectorAll<HTMLButtonElement>("button")].map((button) => button.textContent),
  ).not.toContain("Try a new verification");
});

test("a reload reports the difference the server actually observed", async () => {
  const observed = {
    view: "current" as const,
    resource_sha256: "3".repeat(64),
    tip_height: 3_260,
    update_inclusion_height: 3_248,
    commitment_height: null,
  };
  // The name currently holds one of the planned nameservers and an unrelated
  // record; the plan replaces the whole resource. The difference the panel
  // shows comes from those two server-provided lists, not from anything the
  // client re-derives.
  const mismatched = {
    ...session,
    publish_plan: {
      ...session.publish_plan,
      current_records: [{ type: "NS", ns: "ns1.pirate." }, { type: "TXT", txt: ["unrelated"] }],
    },
    lifecycle: lifecycleFixture("checking_publication", {
      pending_reason: "resource_mismatch_hold",
      observation: observed,
    }),
  };
  let current: SessionFixture = {
    ...session,
    lifecycle: lifecycleFixture("checking_publication", { retry_hint_seconds: 2 }),
  };
  const get = vi.fn(async () => current);
  const api = makeApi(
    async () => ({ community_id: "community-1", attachment: null, session: current }),
    get,
  );
  vi.useFakeTimers();
  const { container } = mount(api);
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("Checking published records");

  current = mismatched;
  await vi.advanceTimersByTimeAsync(4_000);
  expect(get).toHaveBeenCalled();
  expect(container.textContent).toContain("Published resource does not match");
  // The unrelated record the name holds is named as unexpected, and the two
  // nameservers the plan still requires are not both reported missing: one is
  // already published.
  expect(container.textContent).toContain("unrelated");
  expect(container.textContent).toContain("ns2.pirate.");
});

test("an expired sign-in during lifecycle polling is reported as authentication", async () => {
  let rejectRetry!: (error: ApiClientError) => void;
  const get = vi
    .fn<() => Promise<SessionFixture>>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementationOnce(
      () =>
        new Promise<SessionFixture>((_resolve, reject) => {
          rejectRetry = reject;
        }),
    );
  const api = makeApi(
    async () => ({
      community_id: "community-1",
      attachment: null,
      session: {
        ...session,
        lifecycle: lifecycleFixture("checking_publication", { retry_hint_seconds: 2 }),
      },
    }),
    get,
  );
  vi.useFakeTimers();
  const { container } = mount(api);
  await vi.advanceTimersByTimeAsync(2_000);
  const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "Retry status",
  );
  expect(retry).toBeDefined();
  retry?.click();
  await vi.advanceTimersByTimeAsync(0);
  // SAFETY: the exact generated error-definition and wire-body shapes needed
  // to construct the 401 this test exercises.
  rejectRetry(
    new ApiClientError({ name: "unauthorized", status: 401 } as never, {
      error: { code: "unauthorized", message: "withheld", retryable: false },
      request_id: "lifecycle-401",
    } as never),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("Your sign-in has expired.");
  expect(container.textContent).not.toContain("This name needs attention");
});

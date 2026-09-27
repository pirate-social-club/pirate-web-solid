import { ApiClientError } from "@pirate/api-client";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createCommunityNamespaceSettingsApi } from "./community-namespace-settings-api";
import { CommunityNamespaceSettingsController } from "./community-namespace-settings-controller";
import { namespaceIdempotencyKeys } from "./community-namespace-idempotency";
import { CommunityNamespaceSettingsPanel } from "./community-namespace-settings-panel";
import type { CommunityNamespaceSettingsPort, NamespaceSettingsSnapshot } from "./owner-settings-model";

/**
 * Separated clocks (api-next #435, migration 0208).
 *
 * After a plan is exposed, the session `expires_at` is no longer the owner's
 * clock: for new sessions it is a seven-day pre-exposure bound, and for older
 * ones it is a retired one-hour challenge expiry. The lifecycle deadline is
 * the clock. These drive the real controller and assert the owner is never
 * told an exposed import expired because the old hour passed, that the
 * lifecycle deadline is what is shown, that the new recovery holds are named,
 * and that each 409 refusal leads to the action the server named.
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

const NOW = Date.parse("2026-09-25T12:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type PlanRecord = { type: string; ns?: string; txt?: ReadonlyArray<string> };
const emptyRecords = (): PlanRecord[] => [];
const emptyStrings = (): string[] => [];
const planRecords: PlanRecord[] = [
  { type: "NS", ns: "ns1.pirate." },
  { type: "NS", ns: "ns2.pirate." },
  { type: "TXT", txt: ["pirate-verification=session-1"] },
];

type LifecycleBlock = {
  deadline: { at: string; kind: "publication" | "finality" } | null;
  next_check_at: string | null;
  observation: null;
  pending_reason: string | null;
  permitted_actions: ReadonlyArray<string>;
  phase: string;
  retry_hint_seconds: number | null;
  server_time: string;
};

function lifecycle(phase: string, overrides: Partial<LifecycleBlock> = {}): LifecycleBlock {
  return {
    deadline: null,
    next_check_at: null,
    observation: null,
    pending_reason: null,
    permitted_actions: ["poll", "acknowledge"],
    phase,
    retry_hint_seconds: null,
    server_time: new Date(NOW).toISOString(),
    ...overrides,
  };
}

/** A session started by the previous HTTP build: its expiry is the old hour. */
function exposedSession(block: LifecycleBlock) {
  return {
    attachment_intent_id: "attachment-1",
    community_id: "community-1",
    expires_at: new Date(NOW + HOUR).toISOString(),
    replayed: false,
    root_import_session_id: "session-1",
    root_label: "midnight",
    revision: 3,
    status: "awaiting_owner_update",
    publication_check_pending: false,
    publish_plan: {
      added_records: planRecords,
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
    lifecycle: block,
  };
}
type SessionFixture = ReturnType<typeof exposedSession>;

function makeApi(initial: SessionFixture, get: () => Promise<SessionFixture>, poll: () => Promise<SessionFixture> = vi.fn()) {
  return createCommunityNamespaceSettingsApi({
    // SAFETY: these fakes implement exactly the generated methods exercised here.
    client: {
      get_communitiesCommunityIdHnsRootImports: async () => ({ community_id: "community-1", attachment: null, session: initial }),
      get_communitiesCommunityIdHnsRootImportsSessionId: get,
      post_communitiesCommunityIdHnsRootImportsSessionIdPoll: poll,
    } as never,
    communityId: "community-1",
    communityPath: "/c/community-1",
    readCsrfToken: () => "csrf-1",
    locator: { read: () => null, write: () => {}, clear: () => {} },
  });
}

const mount = (api: CommunityNamespaceSettingsPort) =>
  render(() => (
    <CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />
  ));

function conflict(details: Record<string, string>): ApiClientError {
  // SAFETY: the exact generated error-definition and wire-body shapes of a 409.
  return new ApiClientError({ name: "conflict", status: 409 } as never, {
    error: { code: "conflict", message: "withheld", retryable: false, details },
    request_id: "separated-clocks-409",
  } as never);
}

const buttons = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")];

test("an exposed plan survives the old one-hour mark and shows the lifecycle deadline", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const publicationDeadline = new Date(NOW + 14 * DAY).toISOString();
  const session = exposedSession(lifecycle("awaiting_publication", {
    deadline: { at: publicationDeadline, kind: "publication" },
  }));
  const get = vi.fn(async () => session);
  const { container } = mount(makeApi(session, get));
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("Publish these 3 records to midnight/");
  expect(container.querySelector(`time[datetime="${publicationDeadline}"]`)).not.toBeNull();
  expect(container.textContent).toContain("Publish by");
  // The retired challenge expiry is never shown as the owner's deadline.
  expect(container.querySelector(`time[datetime="${session.expires_at}"]`)).toBeNull();
  expect(container.textContent).not.toContain("after which you need a new list");

  await vi.advanceTimersByTimeAsync(HOUR + 60_000);
  expect(container.textContent).toContain("Publish these 3 records to midnight/");
  expect(container.textContent).not.toContain("Verification expired");
  expect(container.querySelector(`time[datetime="${publicationDeadline}"]`)).not.toBeNull();
  // Nothing asked the server either: the old hour is not a clock at all.
  expect(get).not.toHaveBeenCalled();
});

test("reaching the lifecycle deadline asks the server, which holds the import for recovery", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const deadline = { at: new Date(NOW + 2 * HOUR).toISOString(), kind: "publication" as const };
  const session = exposedSession(lifecycle("awaiting_publication", { deadline }));
  const held = exposedSession(lifecycle("recovery_required", {
    deadline,
    pending_reason: "publication_deadline_reached",
    permitted_actions: ["poll", "recover"],
  }));
  const get = vi.fn(async () => held);
  const { container } = mount(makeApi(session, get));
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(2 * HOUR + 1_000);
  expect(get).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("This name needs attention");
  expect(container.textContent).toContain("window to publish these records has passed");
  expect(container.textContent).not.toContain("Verification expired");
});

test.each([
  ["pre_separated_clocks_challenge_expiry", "issued with a one-hour publication window, and that window passed"],
  ["sources_inconsistent", "Handshake sources gave conflicting answers about this name"],
  ["ownership_check_attempts_exhausted", "The ownership check was refused three times"],
])("the %s hold is named, retains authority and offers nothing", async (reason, copy) => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const session = exposedSession(lifecycle("recovery_required", {
    deadline: { at: new Date(NOW - HOUR).toISOString(), kind: "publication" },
    pending_reason: reason,
    permitted_actions: ["poll", "recover"],
  }));
  const { container } = mount(makeApi(session, vi.fn(async () => session)));
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("This name needs attention");
  expect(container.textContent).toContain(copy);
  expect(container.textContent).toContain("We're retaining its authority setup while recovery is reviewed");
  expect(container.textContent).toContain("Publication deadline");
  expect(buttons(container).map((button) => button.textContent)).not.toContain("Try a new verification");
});

/** A controller over a scripted port, for refusals the adapter passes through. */
function scriptedPort(initial: NamespaceSettingsSnapshot, execute: CommunityNamespaceSettingsPort["execute"]): CommunityNamespaceSettingsPort {
  return { read: async () => initial, execute };
}

const startSnapshot: NamespaceSettingsSnapshot = {
  community_id: "community-1",
  family: "hns",
  generation: 2,
  root_label: "midnight",
  next_action: { kind: "start_verification", family: "hns", root_label: "midnight" },
};

const publishSnapshot: NamespaceSettingsSnapshot = {
  community_id: "community-1",
  family: "hns",
  generation: 3,
  root_label: "midnight",
  next_action: {
    kind: "publish_resource",
    acknowledgement_required: true,
    replacement_semantics: "complete_resource",
    records: [{ record_type: "NS", supported: true, value: "ns1.pirate." }],
    added_records: [],
    preserved_records: [],
    removed_records: [],
    preserved_unknown_record_types: [],
  },
};

test("an expired preparation offers a fresh start for the same name", async () => {
  vi.useFakeTimers();
  const execute = vi.fn(async () => {
    throw conflict({ reason: "root_import_preparation_expired", next_action: "start_new_import" });
  });
  const { container } = mount(scriptedPort(startSnapshot, execute));
  await vi.advanceTimersByTimeAsync(0);
  buttons(container).find((button) => button.textContent === "Start verification")?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("Verification expired");
  expect(container.textContent).toContain("Get a new record list for .midnight");
  expect(buttons(container).map((button) => button.textContent)).toContain("Get a new record list");
  expect(container.textContent).not.toContain("could not continue");
});

test("an exhausted ownership check says three checks were refused and recovery is needed", async () => {
  vi.useFakeTimers();
  const execute = vi.fn(async () => {
    throw conflict({ reason: "ownership_check_attempts_exhausted", next_action: "operator_recovery" });
  });
  const { container } = mount(scriptedPort(publishSnapshot, execute));
  await vi.advanceTimersByTimeAsync(0);
  buttons(container).find((button) => button.textContent === "I published all records manually")?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("The ownership check was refused three times, so this import needs recovery.");
  expect(container.textContent).toContain("separated-clocks-409");
});

test("a publication window closed for recovery says nothing more can be published", async () => {
  vi.useFakeTimers();
  const execute = vi.fn(async () => {
    throw conflict({ reason: "publication_window_closed", window_reason: "deadline_passed", next_action: "operator_recovery" });
  });
  const { container } = mount(scriptedPort(publishSnapshot, execute));
  await vi.advanceTimersByTimeAsync(0);
  buttons(container).find((button) => button.textContent === "I published all records manually")?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("The publication window for this import has closed.");
  expect(execute).toHaveBeenCalledTimes(1);
});

test("a publication window closed because the import moved on reads its status", async () => {
  vi.useFakeTimers();
  const moved: NamespaceSettingsSnapshot = {
    ...publishSnapshot,
    generation: 4,
    next_action: { kind: "wait", reason_code: "tree_commitment_pending", retry_after_seconds: 600 },
  };
  const execute = vi.fn<CommunityNamespaceSettingsPort["execute"]>()
    .mockRejectedValueOnce(conflict({ reason: "publication_window_closed", window_reason: "phase_closed", next_action: "read_import_status" }))
    .mockResolvedValueOnce(moved);
  const { container } = mount(scriptedPort(publishSnapshot, execute));
  await vi.advanceTimersByTimeAsync(0);
  buttons(container).find((button) => button.textContent === "I published all records manually")?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(execute.mock.calls[1]?.[0]).toMatchObject({ kind: "poll", expected_generation: 3 });
  expect(container.textContent).toContain("Waiting for tree commitment");
  expect(container.textContent).not.toContain("could not continue");
});

test("a deadline the server still reports as pending is asked about once, not in a loop", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const session = exposedSession(lifecycle("awaiting_publication", {
    deadline: { at: new Date(NOW - 60_000).toISOString(), kind: "publication" },
  }));
  const get = vi.fn(async () => ({ ...session, revision: session.revision }));
  const { container } = mount(makeApi(session, get));
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(get).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Publish these 3 records to midnight/");
  expect(container.textContent).not.toContain("Verification expired");
});

/*
 * Publication controls after a refusal or a passed deadline.
 *
 * The Bob action broadcasts a Handshake UPDATE before acknowledgement asks the
 * API, so a stale publish card must never reach the wallet once the server has
 * closed the window, when the follow-up status read failed, or while a passed
 * publication deadline awaits the server's answer. Each case offers Retry
 * status instead of declaring anything locally.
 */

type BobScope = { bob3?: { connect: () => Promise<{ sendUpdate: (...args: unknown[]) => Promise<void>; signWithName: () => Promise<string> }> } };

function installBob() {
  const sendUpdate = vi.fn(async () => {});
  // SAFETY: the controller reads the optional Bob provider from globalThis;
  // this installs exactly that one optional property for the test.
  const scope = globalThis as BobScope;
  scope.bob3 = { connect: async () => ({ sendUpdate, signWithName: async () => "signature" }) };
  disposers.push(() => { delete scope.bob3; });
  return sendUpdate;
}

const walletPublishSnapshot: NamespaceSettingsSnapshot = {
  ...publishSnapshot,
  next_action: {
    kind: "publish_resource",
    acknowledgement_required: true,
    replacement_semantics: "complete_resource",
    records: [{ record_type: "NS", supported: true, value: "ns1.pirate.", wallet_record: { type: "NS", ns: "ns1.pirate." } }],
    added_records: [],
    preserved_records: [],
    removed_records: [],
    preserved_unknown_record_types: [],
  },
};

const button = (container: HTMLElement, label: string) =>
  buttons(container).find((candidate) => candidate.textContent === label);

async function expectPublicationBlocked(container: HTMLElement, sendUpdate: ReturnType<typeof vi.fn>) {
  const bob = button(container, "Publish to midnight/ with Bob Wallet");
  const manual = button(container, "I published all records manually");
  expect(bob?.disabled).toBe(true);
  expect(manual?.disabled).toBe(true);
  bob?.click();
  manual?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(sendUpdate).not.toHaveBeenCalled();
  expect(container.querySelector("[data-testid=namespace-publication-blocked]")).not.toBeNull();
  expect(button(container, "Retry status")).toBeDefined();
  expect(container.textContent).not.toContain("Verification expired");
}

test.each([
  [{ reason: "publication_window_closed", window_reason: "deadline_passed", next_action: "operator_recovery" }],
  [{ reason: "ownership_check_attempts_exhausted", next_action: "operator_recovery" }],
])("an operator-recovery refusal blocks the Bob publish (%o)", async (details) => {
  vi.useFakeTimers();
  const sendUpdate = installBob();
  const execute = vi.fn<CommunityNamespaceSettingsPort["execute"]>().mockRejectedValue(conflict(details));
  const { container } = mount(scriptedPort(walletPublishSnapshot, execute));
  await vi.advanceTimersByTimeAsync(0);
  expect(button(container, "Publish to midnight/ with Bob Wallet")?.disabled).toBe(false);
  button(container, "I published all records manually")?.click();
  await vi.advanceTimersByTimeAsync(0);
  await expectPublicationBlocked(container, sendUpdate);
  expect(execute).toHaveBeenCalledTimes(1);
});

test("a failed status read after the window moved on blocks the Bob publish", async () => {
  vi.useFakeTimers();
  const sendUpdate = installBob();
  const execute = vi.fn<CommunityNamespaceSettingsPort["execute"]>()
    .mockRejectedValueOnce(conflict({ reason: "publication_window_closed", window_reason: "phase_closed", next_action: "read_import_status" }))
    .mockRejectedValueOnce(new Error("offline"));
  const { container } = mount(scriptedPort(walletPublishSnapshot, execute));
  await vi.advanceTimersByTimeAsync(0);
  button(container, "I published all records manually")?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(execute).toHaveBeenCalledTimes(2);
  await expectPublicationBlocked(container, sendUpdate);
});

test("Retry status unblocks publication only when the server returns a newer snapshot", async () => {
  vi.useFakeTimers();
  const sendUpdate = installBob();
  const reopened: NamespaceSettingsSnapshot = { ...walletPublishSnapshot, generation: 5 };
  const execute = vi.fn<CommunityNamespaceSettingsPort["execute"]>()
    .mockRejectedValueOnce(conflict({ reason: "publication_window_closed", window_reason: "deadline_passed", next_action: "operator_recovery" }))
    .mockResolvedValueOnce(reopened);
  const { container } = mount(scriptedPort(walletPublishSnapshot, execute));
  await vi.advanceTimersByTimeAsync(0);
  button(container, "I published all records manually")?.click();
  await vi.advanceTimersByTimeAsync(0);
  await expectPublicationBlocked(container, sendUpdate);
  button(container, "Retry status")?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(execute.mock.calls[1]?.[0]).toMatchObject({ kind: "poll" });
  expect(button(container, "Publish to midnight/ with Bob Wallet")?.disabled).toBe(false);
  expect(container.querySelector("[data-testid=namespace-publication-blocked]")).toBeNull();
  // Once the server has answered with a newer snapshot, the wallet path works.
  button(container, "Publish to midnight/ with Bob Wallet")?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(sendUpdate).toHaveBeenCalledTimes(1);
});

test("a passed publication deadline blocks the Bob publish while and after the server is asked", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const sendUpdate = installBob();
  const session = exposedSession(lifecycle("awaiting_publication", {
    deadline: { at: new Date(NOW + HOUR).toISOString(), kind: "publication" },
  }));
  let answer!: (value: SessionFixture) => void;
  const get = vi.fn(() => new Promise<SessionFixture>((resolve) => { answer = resolve; }));
  const { container } = mount(makeApi(session, get));
  await vi.advanceTimersByTimeAsync(0);
  expect(button(container, "Publish to midnight/ with Bob Wallet")?.disabled).toBe(false);

  await vi.advanceTimersByTimeAsync(HOUR + 1_000);
  expect(get).toHaveBeenCalledTimes(1);
  // The status read is still in flight.
  expect(button(container, "Publish to midnight/ with Bob Wallet")?.disabled).toBe(true);
  button(container, "Publish to midnight/ with Bob Wallet")?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(sendUpdate).not.toHaveBeenCalled();

  // The server answers without moving the import on; the deadline has still
  // passed, so publication stays blocked and Retry status is offered.
  answer({ ...session });
  await vi.advanceTimersByTimeAsync(0);
  await expectPublicationBlocked(container, sendUpdate);
});

test("a same-revision status read after a refusal keeps publication blocked", async () => {
  vi.useFakeTimers();
  const sendUpdate = installBob();
  // A new object with the same revision is not a change of state.
  const sameRevision: NamespaceSettingsSnapshot = { ...walletPublishSnapshot, next_action: { ...walletPublishSnapshot.next_action } };
  const execute = vi.fn<CommunityNamespaceSettingsPort["execute"]>()
    .mockRejectedValueOnce(conflict({ reason: "publication_window_closed", window_reason: "deadline_passed", next_action: "operator_recovery" }))
    .mockResolvedValue(sameRevision);
  const { container } = mount(scriptedPort(walletPublishSnapshot, execute));
  await vi.advanceTimersByTimeAsync(0);
  button(container, "I published all records manually")?.click();
  await vi.advanceTimersByTimeAsync(0);
  await expectPublicationBlocked(container, sendUpdate);
  button(container, "Retry status")?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(execute.mock.calls[1]?.[0]).toMatchObject({ kind: "poll" });
  await expectPublicationBlocked(container, sendUpdate);
});

test("a same-revision read after a failed status refresh keeps publication blocked", async () => {
  vi.useFakeTimers();
  const sendUpdate = installBob();
  const execute = vi.fn<CommunityNamespaceSettingsPort["execute"]>()
    .mockRejectedValueOnce(conflict({ reason: "publication_window_closed", window_reason: "phase_closed", next_action: "read_import_status" }))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ ...walletPublishSnapshot });
  const { container } = mount(scriptedPort(walletPublishSnapshot, execute));
  await vi.advanceTimersByTimeAsync(0);
  button(container, "I published all records manually")?.click();
  await vi.advanceTimersByTimeAsync(0);
  await expectPublicationBlocked(container, sendUpdate);
  button(container, "Retry status")?.click();
  await vi.advanceTimersByTimeAsync(0);
  await expectPublicationBlocked(container, sendUpdate);
});

test("the Bob click checks the publication deadline itself, even before the panel re-renders", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const publishCompleteResource = vi.fn(async () => {});
  const onCommand = vi.fn();
  const snapshot: NamespaceSettingsSnapshot = {
    ...walletPublishSnapshot,
    lifecycle: {
      deadline: { at: new Date(NOW + 60_000).toISOString(), kind: "publication" },
      next_check_at: null,
      observation: null,
      pending_reason: null,
      permitted_actions: ["poll", "acknowledge"],
      phase: "awaiting_publication",
      retry_hint_seconds: null,
      server_time: new Date(NOW).toISOString(),
    },
  };
  const { container } = render(() => (
    <CommunityNamespaceSettingsPanel
      draftRootLabel="midnight"
      idempotencyKeys={namespaceIdempotencyKeys("deadline-click")}
      onCommand={onCommand}
      onDraftRootLabelChange={() => {}}
      snapshot={snapshot}
      wallet={{ isAvailable: () => true, publishCompleteResource, signRootOwnership: async () => "signature" }}
    />
  ));
  const bob = button(container, "Publish to midnight/ with Bob Wallet");
  expect(bob?.disabled).toBe(false);
  // The deadline passes; nothing has re-rendered the panel yet.
  vi.setSystemTime(NOW + 61_000);
  bob?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(publishCompleteResource).not.toHaveBeenCalled();
  expect(onCommand).not.toHaveBeenCalled();
});

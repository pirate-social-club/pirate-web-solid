import { render, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "@testing-library/user-event";
import type { PirateApiClient } from "../../api/client.ts";
import { establishSessionAuthority, forgetSessionAuthority, replaceSessionAuthority } from "../../api/browser-session-events.ts";
import { refreshSession } from "../../api/session.ts";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../shell/application-session.tsx";
import { GLOBAL_SIGN_IN_EVENT } from "../auth/global-sign-in-host.tsx";
import { CommunityPostCard } from "../community/page-shell/page-shell.tsx";
import { RewardServiceAvailabilityProvider, useRewardServiceAvailability } from "./reward-service-availability.tsx";

type PolicyClient = Pick<PirateApiClient, "get_rewardsQualificationPolicies">;
type Policies = Awaited<ReturnType<PolicyClient["get_rewardsQualificationPolicies"]>>;
const policies: Policies = { policies: [{ activity: "study", policy: {
  kind: "study_session_first_pass_v2", qualification_policy_version_id: "study-v2", required_correct_bps: 7000,
} }] };
const disposers: Array<() => void> = [];
const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
beforeAll(() => Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
afterAll(() => {
  if (scrollDescriptor) Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

function Probe() {
  const available = useRewardServiceAvailability();
  return <span data-availability>{available() ? "available" : "hidden"}</span>;
}
function mount(client: PolicyClient, children: () => JSX.Element = () => <><Probe /><Probe /></>) {
  const [session, setSession] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account-a" });
  const [pending, setPending] = createSignal(false);
  const root = document.createElement("div");
  document.body.appendChild(root);
  createRoot(dispose => {
    disposers.push(dispose);
    render(() => <ApplicationSessionProvider state={session} pending={pending}>
      <RewardServiceAvailabilityProvider client={client}>{children()}</RewardServiceAvailabilityProvider>
    </ApplicationSessionProvider>, root);
  });
  return { root, setSession, setPending };
}
const settled = () => vi.waitFor(() => expect(document.querySelector("[data-availability]")?.textContent).toBe("available"));

beforeEach(() => { establishSessionAuthority(); });
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  forgetSessionAuthority();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("shares one authenticated read across consumers and hides until it succeeds", async () => {
  let resolve: (value: Policies) => void = () => {};
  const read = vi.fn(() => new Promise<Policies>(done => { resolve = done; }));
  mount({ get_rewardsQualificationPolicies: read });
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
  expect([...document.querySelectorAll("[data-availability]")].map(node => node.textContent)).toEqual(["hidden", "hidden"]);
  resolve(policies);
  await settled();
  expect(read).toHaveBeenCalledOnce();
});

test.each([401, 503, "network"])("hides an unavailable or failed policy read: %s", async status => {
  const read = vi.fn(async () => { throw { status }; });
  mount({ get_rewardsQualificationPolicies: read });
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
  expect(document.querySelector("[data-availability]")?.textContent).toBe("hidden");
});

test("fences late responses from a previous identity and hides pending session checks", async () => {
  const requests: Array<{ resolve: (value: Policies) => void; signal?: AbortSignal }> = [];
  const read: PolicyClient["get_rewardsQualificationPolicies"] = (_input, options) => new Promise(resolve => {
    requests.push({ resolve, signal: options?.signal });
  });
  const ui = mount({ get_rewardsQualificationPolicies: read });
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  ui.setPending(true);
  replaceSessionAuthority();
  ui.setSession({ status: "authenticated", userId: "account-b" });
  await vi.waitFor(() => expect(requests[0]!.signal?.aborted).toBe(true));
  requests[0]!.resolve(policies);
  await Promise.resolve();
  expect(ui.root.textContent).toBe("hiddenhidden");
  ui.setPending(false);
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  requests[1]!.resolve(policies);
  await settled();
  ui.setSession("anonymous");
  await vi.waitFor(() => expect(ui.root.textContent).toBe("hiddenhidden"));
});

test("immediately hides on a session refresh and aborts unfinished reads on disposal", async () => {
  let signal: AbortSignal | undefined;
  let calls = 0;
  const read: PolicyClient["get_rewardsQualificationPolicies"] = async (_input, options) => {
    signal = options?.signal;
    return ++calls === 1 ? policies : new Promise(() => {});
  };
  const ui = mount({ get_rewardsQualificationPolicies: read });
  await settled();
  refreshSession();
  await vi.waitFor(() => expect(ui.root.textContent).toBe("hiddenhidden"));
  window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() => expect(calls).toBe(2));
  for (const dispose of disposers.splice(0)) dispose();
  expect(signal?.aborted).toBe(true);
});

test("expires positive availability and bounds an unanswered refresh", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const read = vi.fn<PolicyClient["get_rewardsQualificationPolicies"]>()
    .mockResolvedValueOnce(policies)
    .mockImplementation((_input, options) => { signal = options?.signal; return new Promise(() => {}); });
  const ui = mount({ get_rewardsQualificationPolicies: read });
  await vi.advanceTimersByTimeAsync(0);
  expect(ui.root.textContent).toBe("availableavailable");
  await vi.advanceTimersByTimeAsync(60_000);
  expect(ui.root.textContent).toBe("hiddenhidden");
  expect(read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(signal?.aborted).toBe(true);
});

test("removes Boost and disposes its dialog when availability is lost", async () => {
  // The real dialog uses its network boundary; no provider or funding is invoked.
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: {
    code: "provider_unavailable", message: "Service unavailable", retryable: true,
  } }, { status: 503 })));
  const read = vi.fn(async () => policies);
  const ui = mount({ get_rewardsQualificationPolicies: read }, () => <><Probe /><CommunityPostCard
    communityId="community" post={{ id: "song", kind: "song", title: "Song", body: "", score: 0, publishedAt: "2026-10-15T00:00:00Z" }}
    menuActions={[{ label: "Share", run: () => {} }]}
  /></>);
  await settled();
  await userEvent.setup().click(ui.root.querySelector<HTMLButtonElement>('[aria-label="Post options"]')!);
  const boost = await vi.waitFor(() => {
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(node => node.textContent === "Boost");
    expect(item).toBeDefined();
    return item!;
  });
  await userEvent.setup().click(boost);
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  ui.setPending(true);
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  ui.setPending(false);
  await settled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  ui.setSession("anonymous");
  await vi.waitFor(() => expect(ui.root.querySelector('[data-availability]')?.textContent).toBe("hidden"));
  await userEvent.setup().click(ui.root.querySelector<HTMLButtonElement>('[aria-label="Post options"]')!);
  expect([...document.querySelectorAll('[role="menuitem"]')].map(node => node.textContent)).toEqual(["Share"]);
});


async function openBoost(ui: ReturnType<typeof mount>) {
  await settled();
  const user = userEvent.setup();
  await user.click(ui.root.querySelector<HTMLButtonElement>('[aria-label="Post options"]')!);
  await user.click(await vi.waitFor(() => {
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(node => node.textContent === "Boost");
    expect(item).toBeDefined();
    return item!;
  }));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
}
function signedOutBoost(id: string) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: {
    code: "provider_unavailable", message: "Service unavailable", retryable: true,
  } }, { status: 503 })));
  const prompts = vi.fn();
  window.addEventListener(GLOBAL_SIGN_IN_EVENT, prompts);
  disposers.push(() => window.removeEventListener(GLOBAL_SIGN_IN_EVENT, prompts));
  const ui = mount({ get_rewardsQualificationPolicies: vi.fn(async () => policies) }, () => <><Probe /><CommunityPostCard
    communityId="community" post={{ id, kind: "song", title: "Song", body: "", score: 0, publishedAt: "2026-10-15T00:00:00Z" }}
  /></>);
  return { ui, prompts };
}

test("a Boost dialog closed by a sign-out asks for sign-in and reopens for the same account", async () => {
  const { ui, prompts } = signedOutBoost("song-resume");
  await openBoost(ui);
  // A rejected session revokes availability before the account resolves anonymous.
  ui.setPending(true);
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  ui.setSession("anonymous");
  ui.setPending(false);
  await vi.waitFor(() => expect(prompts).toHaveBeenCalledOnce());
  ui.setSession({ status: "authenticated", userId: "account-a" });
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  expect(prompts).toHaveBeenCalledOnce();
});

test("a Boost dialog closed by a sign-out stays closed when another account signs in", async () => {
  const { ui, prompts } = signedOutBoost("song-other");
  await openBoost(ui);
  ui.setPending(true);
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  ui.setSession("anonymous");
  ui.setPending(false);
  await vi.waitFor(() => expect(prompts).toHaveBeenCalledOnce());
  ui.setSession({ status: "authenticated", userId: "account-b" });
  await settled();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  // The retired entry is spent; the original account no longer reopens it either.
  ui.setSession({ status: "authenticated", userId: "account-a" });
  await settled();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test("keeps an open contribution dialog through healthy availability renewals", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: {
    code: "provider_unavailable", message: "Service unavailable", retryable: true,
  } }, { status: 503 })));
  const read = vi.fn(async () => policies);
  const ui = mount({ get_rewardsQualificationPolicies: read }, () => <><Probe /><CommunityPostCard
    communityId="community" post={{ id: "song", kind: "song", title: "Song", body: "", score: 0, publishedAt: "2026-10-15T00:00:00Z" }}
  /></>);
  await vi.advanceTimersByTimeAsync(0);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(ui.root.querySelector<HTMLButtonElement>('[aria-label="Post options"]')!);
  await user.click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(node => node.textContent === "Boost")!);
  await vi.advanceTimersByTimeAsync(0);
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  for (let minute = 0; minute < 3; minute++) {
    await vi.advanceTimersByTimeAsync(60_000);
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);
    expect(ui.root.querySelector('[data-availability]')?.textContent).toBe("available");
  }
  expect(read.mock.calls.length).toBeGreaterThan(3);
});

test("revokes positive availability when an early renewal fails", async () => {
  vi.useFakeTimers();
  const read = vi.fn<PolicyClient["get_rewardsQualificationPolicies"]>()
    .mockResolvedValueOnce(policies).mockRejectedValueOnce({ status: 503 });
  const ui = mount({ get_rewardsQualificationPolicies: read });
  await vi.advanceTimersByTimeAsync(0);
  expect(ui.root.textContent).toBe("availableavailable");
  await vi.advanceTimersByTimeAsync(45_000);
  expect(read).toHaveBeenCalledTimes(2);
  expect(ui.root.textContent).toBe("hiddenhidden");
});

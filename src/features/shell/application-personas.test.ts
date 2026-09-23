import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import type { AuthenticatedSession, SessionResolution } from "../../api/session.ts";
import { createApplicationPersonas } from "./application-personas.tsx";
import type { ApplicationSessionState } from "./application-session.tsx";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(dispose => dispose()));
const result: AuthenticatedSession = { status: "authenticated", userId: "account-a", personas: [
  { personaId: "harbor", displayName: "Harbor", avatarRef: null, primaryPublicHandle: "harbor.pirate", communityBinding: null },
  { personaId: "night", displayName: "Night Shift", avatarRef: null, primaryPublicHandle: null, communityBinding: null },
] };

test("selection remains stable on account refresh and unknown ids are ignored", async () => {
  const [account, setAccount] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account-a" });
  const load = vi.fn(async () => result);
  const store = createRoot(dispose => { cleanups.push(dispose); return createApplicationPersonas(account, load); });
  await vi.waitFor(() => expect(store.selected()?.personaId).toBe("harbor"));
  store.select("night");
  store.select("foreign-persona");
  await vi.waitFor(() => expect(store.selected()?.personaId).toBe("night"));
  setAccount({ status: "authenticated", userId: "account-a" });
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(store.selected()?.personaId).toBe("night"));
});

test("logout clears private identities and ignores an older in-flight response", async () => {
  const [account, setAccount] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account-a" });
  let finish!: (value: SessionResolution) => void;
  const store = createRoot(dispose => { cleanups.push(dispose); return createApplicationPersonas(account, () => new Promise(resolve => { finish = resolve; })); });
  await vi.waitFor(() => expect(store.loading()).toBe(true));
  setAccount("anonymous");
  await vi.waitFor(() => expect(store.loading()).toBe(false));
  finish(result);
  await Promise.resolve();
  expect(store.personas()).toEqual([]);
  expect(store.selected()).toBeUndefined();
});

test("a failed persona read leaves navigation available and retries independently", async () => {
  const load = vi.fn<() => Promise<SessionResolution>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(result);
  const store = createRoot(dispose => { cleanups.push(dispose); return createApplicationPersonas(() => ({ status: "authenticated", userId: "account-a" }), load); });
  await vi.waitFor(() => expect(store.unavailable()).toBe(true));
  store.retry();
  await vi.waitFor(() => expect(store.selected()?.personaId).toBe("harbor"));
  expect(store.unavailable()).toBe(false);
});

test("an anonymous account retry closes the recovery picker", async () => {
  const [account, setAccount] = createSignal<ApplicationSessionState>("failed");
  const store = createRoot(dispose => { cleanups.push(dispose); return createApplicationPersonas(account); });
  await Promise.resolve();
  store.setPickerOpen(true);
  setAccount("anonymous");
  await vi.waitFor(() => expect(store.pickerOpen()).toBe(false));
});

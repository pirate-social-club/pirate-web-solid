// @vitest-environment-options {"jsdom":{"url":"https://app.pirate.test"}}
import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { OwnerStudyFinancialApi } from "./guest-study-financial-api";
import type { AuthenticatedSession } from "../../api/session";
import { createPageGuestAuthorityStore } from "./guest-authority-selection";
import { OwnerStudyEntry } from "./owner-study-entry";
import { prepared } from "./guest-study-test-fixtures";
import { serializedOwnerLocks } from "./owner-study-test-fixtures";
const cleanups: (() => void)[] = [];
function mount(ui: () => JSX.Element) { const node = document.createElement("div"); document.body.appendChild(node);
  let dispose = () => {}; createRoot(rootDispose => { dispose = rootDispose; solidRender(ui, node); }); cleanups.push(() => { dispose(); node.remove(); }); return node; }
beforeEach(() => vi.stubGlobal("location", { origin: "https://app.pirate.test" }));
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.unstubAllGlobals(); });
test("verified Account switch remounts consent and helper choices without deleting original journal", async () => {
  const store = createPageGuestAuthorityStore();
  const [account, setAccount] = createSignal<AuthenticatedSession>({ status: "authenticated", userId: "account-A", personas: [] });
  const availability = prepared().availability; if (availability.state !== "ready") throw new Error("Ready fixture required");
  const node = mount(() => <OwnerStudyEntry account={account()} communityId="community-1" postId="post-1" availability={availability}
    store={store} locks={serializedOwnerLocks()} onPractice={() => {}} onExit={() => {}} />);
  const firstEntry = node.querySelector("[data-owner-study-consent]");
  const language = node.querySelector<HTMLSelectElement>("select[aria-label='Helper language for rewarded Study']");
  if (language === null) throw new Error("Missing original helper control");
  language.value = "ar"; language.dispatchEvent(new Event("change", { bubbles: true }));
  expect(language.value).toBe("ar"); const before = await store.read();
  setAccount({ status: "authenticated", userId: "account-B", personas: [] });
  await vi.waitFor(() => expect(node.querySelector("[data-owner-study-consent]")).not.toBe(firstEntry));
  expect(node.querySelector<HTMLSelectElement>("select[aria-label='Helper language for rewarded Study']")?.value).toBe("");
  const start = [...node.querySelectorAll("button")].find(v => v.textContent === "Start with accepted original terms");
  expect(start?.disabled).toBe(true); expect(await store.read()).toEqual(before);
});

test("unsupported storage construction refuses finance but leaves ordinary practice actionable", async () => {
  vi.stubGlobal("indexedDB", undefined);
  const practice = vi.fn(), start = vi.fn<OwnerStudyFinancialApi["startSession"]>();
  const unused = async (): Promise<never> => { throw new Error("Unexpected financial effect"); };
  const api: OwnerStudyFinancialApi = { startSession: start, getRewardPreview: unused, getSession: unused, findStartOperation: unused, submitAnswer: unused,
    listParticipations: unused, getParticipation: unused, listCredits: unused, getCredit: unused };
  const availability = prepared().availability; if (availability.state !== "ready") throw new Error("Ready fixture required");
  const node = mount(() => <OwnerStudyEntry api={api} account={{ status: "authenticated", userId: "account-A", personas: [] }} communityId="community-1" postId="post-1"
    availability={availability} locks={serializedOwnerLocks()} onPractice={practice} onExit={() => {}} />);
  expect(node.querySelector("[data-owner-study-unavailable]")).not.toBeNull();
  const action = [...node.querySelectorAll("button")].find(v => v.textContent === "Ordinary practice");
  if (action === undefined) throw new Error("Ordinary practice must remain mounted");
  action.click(); expect(practice).toHaveBeenCalledOnce(); expect(start).not.toHaveBeenCalled();
});

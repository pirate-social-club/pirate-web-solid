import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { UiLocaleProvider, type UiLocaleCode } from "../../../lib/ui-locale.tsx";
import { getLocaleMessages, interpolateMessage } from "../../../locales/index.ts";
import { ConnectedJourney } from "./community-name-connected-fixtures.tsx";

const disposers: Array<() => void> = [];
const originalLanguage = document.documentElement.lang;
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); document.documentElement.lang = originalLanguage; sessionStorage.clear(); });

test.each(["ar", "zh"] as const)("uses the SSR-pinned document locale throughout the connected route without a provider: %s", async locale => {
  document.documentElement.lang = locale;
  const copy = getLocaleMessages(locale, "routes").communityJoinName;
  const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { disposers.push(dispose); render(() => <ConnectedJourney member />, container); });
  const label = interpolateMessage(copy.profileOptions, { name: "Member" });
  await vi.waitFor(() => expect(document.querySelector(`button[aria-label=${JSON.stringify(label)}]`)).not.toBeNull());
  document.querySelector<HTMLButtonElement>(`button[aria-label=${JSON.stringify(label)}]`)!.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain(copy.profileTitle));
  const profileLink = [...document.querySelectorAll("a")].find(link => link.textContent === copy.openProfile);
  expect(profileLink?.getAttribute("href")).toBe("/p/persona-public-1");
  const action = [...document.querySelectorAll("button")].find(button => button.textContent === copy.getName);
  expect(action).toBeDefined(); action!.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain(copy.title));
  expect([...document.querySelectorAll("label")].some(label => label.textContent === copy.label)).toBe(true);
  expect(document.body.textContent).not.toContain("Choose your name");
});

test("retains an explicit Storybook locale override over the document locale", async () => {
  document.documentElement.lang = "ar";
  const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { disposers.push(dispose); render(() => <UiLocaleProvider locale={"en" satisfies UiLocaleCode}><ConnectedJourney member /></UiLocaleProvider>, container); });
  await vi.waitFor(() => expect(document.querySelector('button[aria-label="Profile options, Member"]')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('button[aria-label="Profile options, Member"]')!.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain("Profile in this community"));
});

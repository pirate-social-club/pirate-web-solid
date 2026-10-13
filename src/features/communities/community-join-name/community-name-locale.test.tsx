import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { UiLocaleProvider, type UiLocaleCode } from "../../../lib/ui-locale.tsx";
import { getLocaleMessages } from "../../../locales/index.ts";
import { ConnectedJourney } from "./community-name-connected-fixtures.tsx";

const disposers: Array<() => void> = [];
const originalLanguage = document.documentElement.lang;
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); document.documentElement.lang = originalLanguage; sessionStorage.clear(); localStorage.clear(); });

async function openNamingFromMenu(locale: UiLocaleCode) {
  const copy = getLocaleMessages(locale, "routes").communityJoinName;
  const menu = await vi.waitFor(() => {
    const button = document.querySelector<HTMLButtonElement>(`button[aria-label=${JSON.stringify(copy.profileMenu)}]`);
    expect(button).not.toBeNull(); return button!;
  });
  menu.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain(copy.profileTitle));
  expect(document.querySelector(`dialog[aria-label=${JSON.stringify(copy.title)}], [role="dialog"][aria-label=${JSON.stringify(copy.title)}]`)).toBeNull();
  const getName = await vi.waitFor(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(candidate => candidate.textContent === copy.getNameEntry);
    expect(button).toBeDefined(); expect(button?.disabled).toBe(false); return button!;
  });
  getName.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain(copy.title));
  expect(document.body.textContent).not.toContain(copy.profileTitle);
}

test.each(["ar", "zh"] as const)("uses the SSR-pinned document locale throughout the connected route without a provider: %s", async locale => {
  document.documentElement.lang = locale;
  const copy = getLocaleMessages(locale, "routes").communityJoinName;
  const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { disposers.push(dispose); render(() => <ConnectedJourney member />, container); });
  await openNamingFromMenu(locale);
  expect([...document.querySelectorAll("label")].some(label => label.textContent === copy.label)).toBe(true);
  expect(document.body.textContent).not.toContain("Choose your name");
});

test("retains an explicit Storybook locale override over the document locale", async () => {
  document.documentElement.lang = "ar";
  const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { disposers.push(dispose); render(() => <UiLocaleProvider locale={"en" satisfies UiLocaleCode}><ConnectedJourney member /></UiLocaleProvider>, container); });
  await openNamingFromMenu("en");
  expect(document.body.textContent).not.toContain(getLocaleMessages("ar", "routes").communityJoinName.title);
});

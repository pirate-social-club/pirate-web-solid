import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ApplicationChrome } from "../../shell/media-shell/media-shell";
import { resolveApplicationChrome } from "../../shell/application-chrome-model";
import { CommunityManagementShell } from "./community-management-shell";
import type { OwnerSettingsAccess, OwnerSettingsSection } from "./owner-settings-model";

const FULL_ACCESS: OwnerSettingsAccess = {
  "community.moderation.manage": true,
  "community.namespace.write": true,
  "community.names.manage": true,
  "community.bot.manage": true,
};

const PRODUCTION_ACCESS: OwnerSettingsAccess = FULL_ACCESS;
const MANAGEMENT_PATH = "/c/community_dfb78906/settings/moderation_queue";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
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
  return container;
}

/**
 * The chrome mode is read from the production policy rather than supplied by
 * the test, so a regression that reclassifies management as an ordinary
 * community page fails here instead of passing against a hand-written mode.
 */
function renderManagementRoute(
  options: { access?: OwnerSettingsAccess; pathname?: string; section?: OwnerSettingsSection } = {},
): HTMLElement {
  const pathname = options.pathname ?? MANAGEMENT_PATH;
  const policy = resolveApplicationChrome(pathname);
  return render(() => (
    <ApplicationChrome
      activeItemId={policy.activeItemId}
      mobileActiveItem={policy.mobileActiveItem}
      mobileTitle={policy.mobileTitle}
      mode={policy.mode}
      signedIn
    >
      <CommunityManagementShell
        access={options.access ?? PRODUCTION_ACCESS}
        activeSection={options.section ?? "moderation_queue"}
        communityId="community_dfb78906"
        communityName="Midnight Waves"
        onExit={() => undefined}
        onSectionChange={() => undefined}
      >
        <p>Panel content</p>
      </CommunityManagementShell>
    </ApplicationChrome>
  ));
}

function navLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[aria-label]"))
    .map((element) => element.getAttribute("aria-label") ?? "");
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

describe("Community management takeover shell", () => {
  test("renders one management sidebar and no application sidebar", () => {
    const container = renderManagementRoute();

    const management = container.querySelectorAll('nav[aria-label="Community management"]');
    expect(management).toHaveLength(1);
    expect(container.querySelector("aside")).toBeNull();
    expect(navLabels(container)).not.toContain("PIRATE");
    expect(navLabels(container)).not.toContain("Pirate navigation");
  });

  test("renders no global mobile footer navigation", () => {
    const container = renderManagementRoute();

    expect(container.querySelector('nav[aria-label="Primary navigation"]')).toBeNull();
  });

  // jsdom does not evaluate the media queries these classes carry, so this
  // asserts the responsive structure only. The Storybook stories assert what a
  // viewer actually sees, measuring computed visibility at each viewport.
  test("exposes one responsive heading per viewport, naming the active section", () => {
    const container = renderManagementRoute({ section: "namespace" });

    const headings = Array.from(container.querySelectorAll("h1"));
    expect(headings.map((heading) => heading.textContent?.trim()))
      .toEqual(["Community address", "Community address"]);

    const desktop = container.querySelector("main h1");
    const mobile = container.querySelector("header h1");
    expect(desktop?.className).toContain("hidden");
    expect(desktop?.className).toContain("md:block");
    expect(mobile?.closest("header")?.className).toContain("md:hidden");
    // The two are complementary, never both exposed at one width.
    expect(desktop).not.toBe(mobile);
  });

  test("leads the navigation with the moderation queue", () => {
    const container = renderManagementRoute();

    const items = Array.from(
      container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Community management"] li button'),
    ).map((button) => button.textContent?.trim());
    expect(items[0]).toBe("Queue");
    expect(items.indexOf("Queue")).toBeLessThan(items.indexOf("Address"));
  });

  test("marks only the active section as the current page", () => {
    const container = renderManagementRoute({ section: "namespace" });

    const current = Array.from(
      container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Community management"] li button'),
    ).filter((button) => button.getAttribute("aria-current") === "page");
    expect(current.map((button) => button.textContent?.trim())).toEqual(["Address"]);
  });

  test("exits to the community rather than through application chrome", () => {
    const onExit = vi.fn();
    const policy = resolveApplicationChrome(MANAGEMENT_PATH);
    const container = render(() => (
      <ApplicationChrome mode={policy.mode} signedIn>
        <CommunityManagementShell
          access={PRODUCTION_ACCESS}
          activeSection="moderation_queue"
          communityName="Midnight Waves"
          onExit={onExit}
          onSectionChange={() => undefined}
        >
          <p>Panel content</p>
        </CommunityManagementShell>
      </ApplicationChrome>
    ));

    const exits = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .filter((button) => button.getAttribute("aria-label") === "Close community management");
    expect(exits).toHaveLength(2);
    exits[0]?.click();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  test("an ordinary community route still renders the application chrome", () => {
    const policy = resolveApplicationChrome("/c/community_dfb78906");
    const container = render(() => (
      <ApplicationChrome
        activeItemId={policy.activeItemId}
        mobileActiveItem={policy.mobileActiveItem}
        mobileTitle={policy.mobileTitle}
        mode={policy.mode}
        signedIn
      >
        <main>Community page</main>
      </ApplicationChrome>
    ));

    expect(policy.mode).toBe("standard");
    expect(container.querySelector("aside")).not.toBeNull();
  });

  test("hides the navigation entirely when no capability is granted", () => {
    const container = renderManagementRoute({ access: {} });

    expect(container.querySelector('nav[aria-label="Community management"]')).toBeNull();
    expect(container.textContent).toContain("No management tools available");
  });
});

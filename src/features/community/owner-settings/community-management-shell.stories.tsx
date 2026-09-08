import { Show, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Button, Card, Type } from "../../../design-system";
import { ApplicationChrome } from "../../shell/media-shell/media-shell";
import { resolveApplicationChrome } from "../../shell/application-chrome-model";
import { CommunityManagementSections, CommunityManagementShell } from "./community-management-shell";
import type { OwnerSettingsAccess, OwnerSettingsSection } from "./owner-settings-model";

/**
 * Access as the production route loader actually supplies it. It derives
 * capabilities from the moderation, names and Telegram reads only, so the
 * profile, rules, links and archive sections are absent here on purpose.
 */
const PRODUCTION_ACCESS: OwnerSettingsAccess = {
  "community.moderation.manage": true,
  "community.namespace.write": true,
  "community.names.manage": true,
  "community.bot.manage": true,
};

const COMMUNITY_ID = "community_dfb78906";

function managementPath(section: OwnerSettingsSection): string {
  return `/c/${COMMUNITY_ID}/settings/${section}`;
}

function PanelPlaceholder(props: { section: OwnerSettingsSection }) {
  return (
    <Card class="flex flex-col gap-4 p-6">
      <Type as="h2" variant="h3">Panel content</Type>
      <Type as="p" class="text-muted-foreground" variant="body">
        The {props.section.replaceAll("_", " ")} panel renders here. This story owns the shell, not the panel.
      </Type>
      <div class="flex flex-wrap gap-2">
        <Button>Primary action</Button>
        <Button variant="secondary">Secondary action</Button>
        <Button disabled>Unavailable action</Button>
      </div>
    </Card>
  );
}

/**
 * The chrome mode comes from the production policy, never from a hand-written
 * prop, so a story cannot pass while the real route classification regresses.
 */
function ManagementRoute(props: { access?: OwnerSettingsAccess; index?: boolean; initialSection?: OwnerSettingsSection }) {
  const [section, setSection] = createSignal<OwnerSettingsSection | null>(
    props.index === true ? null : props.initialSection ?? "moderation_queue",
  );
  const policy = () => resolveApplicationChrome(managementPath(section() ?? "moderation_queue"));
  return (
    <ApplicationChrome
      activeItemId={policy().activeItemId}
      mobileActiveItem={policy().mobileActiveItem}
      mobileTitle={policy().mobileTitle}
      mode={policy().mode}
      signedIn
    >
      <CommunityManagementShell
        access={props.access ?? PRODUCTION_ACCESS}
        activeSection={section()}
        communityId={COMMUNITY_ID}
        communityName="Midnight Waves"
        onBack={() => setSection(null)}
        onExit={() => undefined}
        onSectionChange={setSection}
      >
        <Show
          when={section()}
          fallback={
            <CommunityManagementSections
              access={props.access ?? PRODUCTION_ACCESS}
              onSectionChange={setSection}
            />
          }
        >
          {(current) => <PanelPlaceholder section={current()} />}
        </Show>
      </CommunityManagementShell>
    </ApplicationChrome>
  );
}

// The stories drive the route through ManagementRoute rather than binding
// component args, so the chrome policy stays part of what is exercised.
function visibleHeadings(canvasElement: HTMLElement): string[] {
  return Array.from(canvasElement.querySelectorAll("h1"))
    .filter((heading) => heading.offsetParent !== null)
    .map((heading) => heading.textContent?.trim() ?? "");
}

const meta = {
  title: "Screens/Community/Management/Shell",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const QueueFirstDesktop: Story = {
  render: () => <ManagementRoute />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole("navigation", { name: "Community management" });

    // One management sidebar, and no application chrome beside it.
    await expect(canvas.queryAllByRole("navigation", { name: "Community management" })).toHaveLength(1);
    await expect(canvas.queryByLabelText("PIRATE")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();

    // The work queue leads the navigation.
    const items = within(nav).getAllByRole("button").map((button) => button.textContent?.trim());
    await expect(items[0]).toBe("Queue");

    // Exactly one heading is exposed at this width; the mobile one is hidden.
    expect(visibleHeadings(canvasElement)).toEqual(["Moderation queue"]);
  },
};

export const SectionChange: Story = {
  render: () => <ManagementRoute />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole("navigation", { name: "Community management" });

    await userEvent.click(within(nav).getByRole("button", { name: "Address" }));
    await expect(canvas.getByRole("heading", { level: 1, name: "Community address" })).toBeInTheDocument();
    await expect(within(nav).getByRole("button", { name: "Address" })).toHaveAttribute("aria-current", "page");
    await expect(within(nav).getByRole("button", { name: "Queue" })).not.toHaveAttribute("aria-current");
  },
};

export const InteractionStates: Story = {
  render: () => <ManagementRoute />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole("navigation", { name: "Community management" });
    const queue = within(nav).getByRole("button", { name: "Queue" });
    const address = within(nav).getByRole("button", { name: "Address" });

    // Active: the current section is announced, not merely tinted.
    await expect(queue).toHaveAttribute("aria-current", "page");

    // Pointer: an enabled control reads as clickable, a disabled one does not.
    // The base rule restored in the design-system tokens is what makes the bare
    // nav button a pointer target without its own cursor class.
    expect(getComputedStyle(address).cursor).toBe("pointer");
    // A disabled control takes no pointer events, so the pointer never lands on
    // it and the viewer keeps the surrounding cursor. Its computed `cursor` is
    // not the property that decides this, so it is not what is asserted.
    const disabled = canvas.getByRole("button", { name: "Unavailable action" });
    await expect(disabled).toBeDisabled();
    expect(getComputedStyle(disabled).pointerEvents).toBe("none");

    // Keyboard: the same control takes focus and activates without a pointer.
    address.focus();
    await expect(address).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("heading", { level: 1, name: "Community address" })).toBeInTheDocument();
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <ManagementRoute />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Close community management" }).length).toBeGreaterThan(0);

    // The complementary heading: one exposed here too, now the mobile one.
    expect(visibleHeadings(canvasElement)).toEqual(["Moderation queue"]);
  },
};

export const NoCapabilities: Story = {
  render: () => <ManagementRoute access={{}} />,
};

export const MobileIndex: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <ManagementRoute index />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("navigation", { name: "All management sections" });

    // No sidebar at this width, so the grouped list is how a section is reached.
    await expect(canvas.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    expect(visibleHeadings(canvasElement)).toEqual(["Community management"]);

    await userEvent.click(within(list).getByRole("button", { name: /Address/ }));
    expect(visibleHeadings(canvasElement)).toEqual(["Community address"]);

    // And back out again, one step.
    await userEvent.click(canvas.getByRole("button", { name: "Back to all sections" }));
    expect(visibleHeadings(canvasElement)).toEqual(["Community management"]);
  },
};

import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "../../../design-system";
import type { SwitchablePersona } from "../../identity/persona-switcher-sheet/persona-switcher-sheet";
import { MobilePersonaFooter } from "./mobile-persona-footer";

const personas = [
  {
    personaId: "persona_saint_pablo",
    displayName: "Saint Pablo",
    publicHandle: "saint-pablo.pirate",
    avatarSeed: "saint-pablo.pirate",
  },
  {
    personaId: "persona_night_shift",
    displayName: "Night Shift",
    publicHandle: "nightshift.pirate",
    avatarSeed: "nightshift.pirate",
  },
  {
    personaId: "persona_mirror_room",
    displayName: "Mirror Room",
    publicHandle: "mirror.squirtle",
    avatarSeed: "mirror.squirtle",
  },
] satisfies SwitchablePersona[];

function FooterStory(props: {
  activeItem?: "home" | "profile" | "study" | "wallet";
  initialOpen?: boolean;
  initialPersonaId?: string;
  personas?: readonly SwitchablePersona[];
}) {
  const available = () => props.personas ?? personas;
  const [selectedPersonaId, setSelectedPersonaId] = createSignal(
    props.initialPersonaId ?? available()[0]?.personaId ?? "",
  );

  return (
    <div class="min-h-dvh bg-background px-6 pb-28 pt-8 text-foreground">
      <div class="mx-auto max-w-sm space-y-2 rounded-[var(--radius-xl)] bg-card p-5">
        <Type as="h1" variant="h3">Mobile shell</Type>
        <Type as="p" variant="caption">Profile changes the active persona used across the app.</Type>
      </div>
      <MobilePersonaFooter
        activeItem={props.activeItem ?? "home"}
        initialProfileSheetOpen={props.initialOpen}
        onPersonaChange={setSelectedPersonaId}
        personas={available()}
        selectedPersonaId={selectedPersonaId()}
      />
    </div>
  );
}

const meta = {
  title: "Flows/Shell/MobilePersonaFooter",
  component: MobilePersonaFooter,
  args: {
    personas,
    selectedPersonaId: personas[0]!.personaId,
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  globals: { viewport: { value: "mobile2", isRotated: false } },
} satisfies Meta<typeof MobilePersonaFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Four tabs",
  render: () => <FooterStory />,
};

export const ProfileSheetOpen: Story = {
  name: "Profile switcher open",
  render: () => <FooterStory activeItem="profile" initialOpen />,
};

export const SinglePersona: Story = {
  name: "One persona",
  render: () => <FooterStory activeItem="profile" initialOpen personas={[personas[0]!]} />,
};

export const AlternatePersonaSelected: Story = {
  name: "Changed persona",
  render: () => <FooterStory activeItem="profile" initialPersonaId="persona_night_shift" />,
};

export const InteractivePersonaChange: Story = {
  name: "Select another persona",
  render: () => <FooterStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: /Switch profile/ }));
    await userEvent.click(page.getByRole("radio", { name: /Night Shift/ }));
    await expect(canvas.getByRole("button", { name: /currently Night Shift/ })).toBeInTheDocument();
  },
};

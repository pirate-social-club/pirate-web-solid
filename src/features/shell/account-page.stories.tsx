import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AccountPage } from "./account-page.tsx";
import { ApplicationSessionProvider, type ApplicationSessionState } from "./application-session.tsx";
import { ApplicationPersonasContext, createApplicationPersonas } from "./application-personas.tsx";
import { PersonaSwitcherSheet } from "../identity/persona-switcher-sheet/persona-switcher-sheet.tsx";
import { switcherPersonas } from "../identity/persona-switcher-sheet/persona-switcher-fixtures.ts";

function AccountStory(props: { anonymous?: boolean; profile?: boolean }) {
  const [account] = createSignal<ApplicationSessionState>(props.anonymous ? "anonymous" : { status: "authenticated", userId: "story-account" });
  const profiles = createApplicationPersonas(account, async () => ({
    status: "authenticated", userId: "story-account", personas: switcherPersonas.map(persona => ({
      personaId: persona.personaId, displayName: persona.displayName,
      avatarRef: persona.avatarSrc ?? null, primaryPublicHandle: persona.publicHandle ?? null, communityBinding: null,
    })),
  }));
  return <ApplicationSessionProvider state={account}><ApplicationPersonasContext value={profiles}>
    <AccountPage profile={props.profile} navigate={() => {}} />
    <PersonaSwitcherSheet open={profiles.pickerOpen()} onOpenChange={profiles.setPickerOpen} onSelect={profiles.select} personas={profiles.personas()} selectedPersonaId={profiles.selected()?.personaId ?? ""} />
  </ApplicationPersonasContext></ApplicationSessionProvider>;
}
const meta = { title: "Screens/Settings/Account", parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Settings: Story = { render: () => <AccountStory /> };
export const Profile: Story = { render: () => <AccountStory profile /> };
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <AccountStory /> };
export const SignedOut: Story = { render: () => <AccountStory anonymous /> };

import { createSignal, Show } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ApplicationPersonasContext, type ApplicationPersonas } from "../shell/application-personas.tsx";
import { ApplicationSessionProvider } from "../shell/application-session.tsx";
import { AccountPage } from "../shell/account-page.tsx";
import PublicProfilePage from "./public-profile-page/public-profile-page.tsx";

function ProfileSettingsReview() {
  const [settings, setSettings] = createSignal(false);
  const profile = { personaId: "owned", displayName: "Owned profile", publicHandle: "owned.pirate" };
  const profiles: ApplicationPersonas = {
    personas: () => [profile], selected: () => profile,
    loading: () => false, unavailable: () => false, pickerOpen: () => false,
    setPickerOpen: () => {}, select: () => {}, retry: () => {},
  };
  return <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "viewer" })}><ApplicationPersonasContext value={profiles}>
    <div onClick={event => {
      const target = event.target;
      if (target instanceof Element && target.closest('a[href="/settings"]')) { event.preventDefault(); setSettings(true); }
    }}>
      <Show when={settings()} fallback={<PublicProfilePage handle="owned.pirate" data={{ kind: "success", status: 200, requestedHandle: "owned.pirate", canonicalHandle: "owned.pirate", canonicalPath: "/u/owned.pirate", isCanonical: true, profile: { displayName: "Owned profile", handle: "owned.pirate", bio: null }, communities: [] }} />}>
        <AccountPage navigate={() => setSettings(false)} />
      </Show>
    </div>
  </ApplicationPersonasContext></ApplicationSessionProvider>;
}
const meta = { title: "Screens/Profile/Account access", parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const OwnProfileSettings: Story = {
  render: () => <ProfileSettingsReview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("link", { name: "Settings" }));
    await expect(await canvas.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Switch profile" })).toBeInTheDocument();
  },
};

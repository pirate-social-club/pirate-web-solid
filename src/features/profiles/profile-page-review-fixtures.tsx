import { createSignal, Show } from "solid-js";
import { ApplicationPersonasContext, type ApplicationPersonas } from "../shell/application-personas.tsx";
import { ApplicationSessionProvider } from "../shell/application-session.tsx";
import { AccountPage } from "../shell/account-page.tsx";
import { profileActivityDependencies } from "./profile-page/profile-activity-fixtures.ts";
import PublicProfilePage from "./public-profile-page/public-profile-page.tsx";

/** Actual public profile layout with explicit owner or visitor fixtures. */
export function ProfileSettingsReview(props: { visitor?: boolean; live?: boolean } = {}) {
  const activity = profileActivityDependencies(props.visitor === true);
  const [settings, setSettings] = createSignal(false);
  const profile = { personaId: "owned", displayName: "Owned profile", publicHandle: "owned.pirate" };
  const profiles: ApplicationPersonas = {
    personas: () => props.visitor ? [] : [profile], selected: () => props.visitor ? undefined : profile,
    loading: () => false, unavailable: () => false, pickerOpen: () => false,
    setPickerOpen: () => {}, select: () => {}, retry: () => {},
  };
  return <ApplicationSessionProvider state={() => props.visitor ? "anonymous" : { status: "authenticated", userId: "viewer" }}><ApplicationPersonasContext value={profiles}>
    <div onClick={event => {
      const target = event.target;
      if (target instanceof Element && target.closest('a[href="/settings"]')) { event.preventDefault(); setSettings(true); }
    }}>
      <Show when={settings()} fallback={<PublicProfilePage handle="owned.pirate" activityDependencies={activity} data={{ kind: "success", status: 200, requestedHandle: "owned.pirate", canonicalHandle: "owned.pirate", canonicalPath: "/u/owned.pirate", isCanonical: true, profile: { personaId: "owned", displayName: "Owned profile", handle: "owned.pirate", bio: "Songs, community sessions and late-night listening.", avatarRef: "/storybook/karaoke-artwork.svg", coverRef: "/storybook/karaoke-artwork.svg" }, communities: [{ name: "Harbor Collective", href: "/c/harbor" }, { name: "Night Shift", href: "/c/night-shift" }] }} />}><AccountPage navigate={() => setSettings(false)} /></Show>
    </div>
  </ApplicationPersonasContext></ApplicationSessionProvider>;
}

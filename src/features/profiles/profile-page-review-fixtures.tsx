import { createSignal, Show } from "solid-js";
import { ApplicationPersonasContext, type ApplicationPersonas } from "../shell/application-personas.tsx";
import { ApplicationSessionProvider } from "../shell/application-session.tsx";
import { AccountPage } from "../shell/account-page.tsx";
import PublicProfilePage from "./public-profile-page/public-profile-page.tsx";

export function ProfileSettingsReview() {
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
      <Show when={settings()} fallback={<PublicProfilePage activity={{ items: [{ id: "post-1", kind: "post", title: "Harbor Lights", body: "A new song for our next listening session.", context: "Harbor Collective" }, { id: "comment-1", kind: "comment", title: "On Open Water", body: "The chorus is a good place to start practising.", context: "Night Shift" }], stats: [{ label: "Contributions", value: "24" }, { label: "Followers", value: "128" }] }} handle="owned.pirate" data={{ kind: "success", status: 200, requestedHandle: "owned.pirate", canonicalHandle: "owned.pirate", canonicalPath: "/u/owned.pirate", isCanonical: true, profile: { displayName: "Owned profile", handle: "owned.pirate", bio: "Songs, community sessions and late-night listening." }, communities: [] }} />}>
        <AccountPage navigate={() => setSettings(false)} />
      </Show>
    </div>
  </ApplicationPersonasContext></ApplicationSessionProvider>;
}

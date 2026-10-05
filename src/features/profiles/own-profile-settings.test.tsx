import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { expect, test, vi } from "vitest";
import { ApplicationPersonasContext, type ApplicationPersonas } from "../shell/application-personas.tsx";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../shell/application-session.tsx";
import { OwnProfileSettings } from "./own-profile-settings.tsx";

const ownedProfiles: ApplicationPersonas = {
  personas: () => [{ personaId: "owned", displayName: "Owned profile", publicHandle: "owned.pirate" }],
  selected: () => undefined, loading: () => false, unavailable: () => false,
  pickerOpen: () => false, setPickerOpen: () => {}, select: () => {}, retry: () => {},
};

test("Settings follows resolved ownership and disappears after sign out or a profile change", async () => {
  const container = document.createElement("div");
  const [account, setAccount] = createSignal<ApplicationSessionState>("resolving");
  const [handle, setHandle] = createSignal("owned.pirate");
  let dispose = () => {};
  createRoot(stop => {
    dispose = stop;
    solidRender(() => <ApplicationSessionProvider state={account}><ApplicationPersonasContext value={ownedProfiles}>
      <OwnProfileSettings handle={handle()} /><OwnProfileSettings personaId="other" />
    </ApplicationPersonasContext></ApplicationSessionProvider>, container);
  });
  try {
    expect(container.querySelector('a[href="/settings"]')).toBeNull();
    setAccount({ status: "authenticated", userId: "viewer" });
    await vi.waitFor(() => expect(container.querySelectorAll('a[href="/settings"]')).toHaveLength(1));
    setHandle("other.pirate");
    await vi.waitFor(() => expect(container.querySelector('a')).toBeNull());
    setHandle("owned.pirate");
    await vi.waitFor(() => expect(container.querySelector('a')).not.toBeNull());
    setAccount("anonymous");
    await vi.waitFor(() => expect(container.querySelector('a')).toBeNull());
  } finally { dispose(); }
});

import { renderToString } from "@solidjs/web";
import { expect, test } from "vitest";
import { ApplicationPersonasContext, type ApplicationPersonas } from "../shell/application-personas.tsx";
import { ApplicationSessionProvider } from "../shell/application-session.tsx";
import { OwnProfileSettings } from "./own-profile-settings.tsx";

const profiles: ApplicationPersonas = {
  personas: () => [{ personaId: "owned", displayName: "Owned", publicHandle: "owned.pirate" }],
  selected: () => undefined, loading: () => false, unavailable: () => false,
  pickerOpen: () => false, setPickerOpen: () => {}, select: () => {}, retry: () => {},
};
test("cached public HTML contains no private Settings link even with an owned profile context", () => {
  const html = renderToString(() => <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "viewer" })}><ApplicationPersonasContext value={profiles}>
    <OwnProfileSettings handle="owned.pirate" /><OwnProfileSettings personaId="owned" />
  </ApplicationPersonasContext></ApplicationSessionProvider>);
  expect(html).not.toContain("/settings");
});

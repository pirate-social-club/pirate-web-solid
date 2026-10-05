import { ProfileLayout } from "./profile-page/profile-layout.tsx";
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

test("the complete cached hero renders public media and details without account controls or activity tabs", () => {
  const html = renderToString(() => <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "viewer" })}><ApplicationPersonasContext value={profiles}>
    <ProfileLayout name="Owned" handle="owned.pirate" personaId="owned" servingOrigin="https://web-next-staging.pirate.sc"
      avatarRef="/media/avatar" coverRef="/media/cover" bio="Public bio" />
  </ApplicationPersonasContext></ApplicationSessionProvider>);
  expect(html).toContain("https://web-next-staging.pirate.sc/media/avatar");
  expect(html).toContain("https://web-next-staging.pirate.sc/media/cover");
  expect(html).toContain("Public bio");
  expect(html).not.toContain("created-communities-heading");
  expect(html).not.toContain("/settings");
  expect(html).not.toContain('role="tab"');
  expect(html).not.toContain("xl:grid-cols-");
  expect(html).not.toContain("xl:col-start-2");
});

test("a persona fallback name does not repeat its handle", () => {
  const html = renderToString(() => <ProfileLayout name="owned.pirate" handle="owned.pirate" />);
  expect(html).toContain("owned.pirate");
  expect(html).not.toContain("data-profile-handle");
});

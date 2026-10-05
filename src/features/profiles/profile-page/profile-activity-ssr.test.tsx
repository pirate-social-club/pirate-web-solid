import { createRequestEvent, renderToString } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { expect, test, vi } from "vitest";
import { ProfileActivity } from "./profile-activity.tsx";
import { profileActivityFixture } from "./profile-activity-fixtures.ts";

test("cached profile HTML defers activity controls and performs no session or viewer-authorized activity read", () => {
  const session = vi.fn(); const read = vi.fn(async () => profileActivityFixture);
  const html = renderToString(() => <ProfileActivity personaId="owned" dependencies={{ resolveSession: session, client: { get_publicPersonasPersonaIdActivity: read } }} />);
  expect(html).not.toContain('role="tab"'); expect(html).toContain("Loading activity");
  expect(html).not.toContain("Harbor Lights"); expect(html).not.toContain("The chorus");
  expect(session).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
});

test("static persona hosts omit activity controls while hydration remains disabled", () => {
  const event = createRequestEvent(new Request("https://profile.example/"));
  // SAFETY: this fixture supplies the same presentation flag entry-server owns.
  (event.locals as typeof event.locals & { profileActivityHydrationDisabled?: boolean }).profileActivityHydrationDisabled = true;
  const html = provideRequestEvent(event, () => renderToString(() => <ProfileActivity personaId="owned" />));
  expect(html).not.toContain('role="tab"'); expect(html).not.toContain("Loading activity");
});

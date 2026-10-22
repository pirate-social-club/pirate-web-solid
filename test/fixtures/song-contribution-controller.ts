import { vi } from "vitest";
import { createSongContributionFixture } from "../../src/features/rewards/song-contribution.fixtures.ts";

export function contributionControllerFixture() {
  const fixture = createSongContributionFixture();
  for (const method of ["context", "create", "state", "command", "claim", "observe", "recover", "cancellation"] as const) vi.spyOn(fixture.api, method);
  for (const method of ["estimate", "send", "dispose"] as const) vi.spyOn(fixture.wallet, method);
  return fixture;
}

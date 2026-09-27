import { renderToString } from "@solidjs/web";
import { describe, expect, test, vi } from "vitest";

import SpacesClaimStatus from "./spaces-claim-status.tsx";

describe("Spaces claim status server markup", () => {
  test("keeps a loading shell and does not read a private claim before hydration", () => {
    const get = vi.fn(async () => { throw new Error("server must not read private claim"); });
    const client = { get_handleClaimsClaimId: get };
    const html = renderToString(() => <SpacesClaimStatus
      claimId="handle_claim_test"
      communityPath="/c/yahoo/names"
      client={client}
    />);
    expect(html).toContain("Checking your registration");
    expect(html).not.toContain("The registration status could not be loaded");
    expect(get).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { fetchVerificationConfig, publicVerificationConfig, verificationConfigResponse } from "./verification-config.ts";

describe("verification public configuration", () => {
  it("is absent unless explicitly enabled with valid public identifiers", () => {
    expect(publicVerificationConfig({ PRIVY_APP_ID: "app" })).toBeUndefined();
    expect(publicVerificationConfig({ VERIFICATION_UI_ENABLED: "true", PRIVY_APP_ID: " app" })).toBeUndefined();
    expect(publicVerificationConfig({ VERIFICATION_UI_ENABLED: "true", PRIVY_APP_ID: "app" })).toEqual({ enabled: true, privyAppId: "app" });
  });

  it("serves only GET and never caches", async () => {
    const env = { VERIFICATION_UI_ENABLED: "true", PRIVY_APP_ID: "app", PRIVY_CLIENT_ID: "client" };
    expect(verificationConfigResponse(new Request("https://solid.test/config", { method: "POST" }), env).status).toBe(405);
    const response = verificationConfigResponse(new Request("https://solid.test/config"), env);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ enabled: true, privyAppId: "app", privyClientId: "client" });
  });

  it("strictly validates the browser response", async () => {
    const config = await fetchVerificationConfig(async () => Response.json({ enabled: true, privyAppId: "app" }));
    expect(config.privyAppId).toBe("app");
    await expect(fetchVerificationConfig(async () => Response.json({ enabled: true, privyAppId: "app", secret: "no" }))).rejects.toThrow("verification_unavailable");
  });
});

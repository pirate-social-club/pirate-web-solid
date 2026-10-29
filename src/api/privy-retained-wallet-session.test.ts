// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { createPrivySessionExchange } from "./privy-session.ts";
import { createSessionApiClient } from "./client.ts";
import { browserIdentitySession } from "./browser-identity-session.ts";
import { forgetSessionAuthority } from "./browser-session-events.ts";
import { clearWalletAuthorization } from "./privy-wallet-authorization.ts";

test("retaining an explicit wallet handle anchors its account after the new authority epoch", async () => {
  browserIdentitySession.clear(); forgetSessionAuthority();
  const proof = `header.${btoa(JSON.stringify({ sub: "did:privy:fixture-role" }))}.signature`;
  const fetchImpl = vi.fn(async () => Response.json({
    id: "account-owner", object: "user", verification_state: "unverified", created: 1,
    verification_capabilities: Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(key => [key, { state: "unverified" }])),
  }));
  const confirmWallet = vi.fn(async () => ({ hd_wallet_index: 4 }));
  const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "fixture-app" }, {
    createPrivy: async () => ({
      auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => {} } },
      initialize: async () => {}, getAccessToken: async () => proof,
      ensureEmbeddedEthereumWallet: async () => {},
    }),
    exchange: async () => {},
    readAccountId: async () => (await createSessionApiClient({ origin: "https://pirate.test", fetchImpl }).get_usersMe(undefined)).id,
    listPendingWallets: async () => ({ wallets: [] }), listPersonas: async () => ({ personas: [] }),
    csrf: () => "fixture-csrf", retainSession: session => browserIdentitySession.retain(session),
    prepareWallet: async persona_id => ({ persona_id, hd_wallet_index: 4, status: "pending" }), confirmWallet,
  });
  try {
    await auth.loginWithCode("operator@example.test", "123456");
    expect(await browserIdentitySession.activatePersonaWallet("account-owner", "new-profile", "original-wallet-command", new AbortController().signal)).toBe(true);
    expect(confirmWallet).toHaveBeenCalledOnce();
  } finally { browserIdentitySession.clear(); clearWalletAuthorization(); forgetSessionAuthority(); }
});

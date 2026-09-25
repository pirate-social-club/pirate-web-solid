import { describe, expect, test, vi } from "vitest";
import type { PostPersonasPersonaIdWalletsSpacesTaprootStatusResponse } from "@pirate/api-client";
import type { SessionSpacesTaprootApiClient } from "./handle-sales-client.ts";
import type { PrivyAuthClient } from "./privy-session.ts";
import { createSpacesTaprootWalletSession } from "./spaces-taproot-wallet-session.ts";

const config = { enabled: true, privyAppId: "test-app" } as const;
const csrf = "test-csrf";

function fixture() {
  const add = vi.fn(async () => undefined);
  const sign = vi.fn(async () => "ab".repeat(64));
  const privy = {
    initialize: vi.fn(async () => undefined),
    getAccessToken: vi.fn(async () => "test-token"),
    auth: { email: {
      sendCode: vi.fn(async () => ({ success: true })),
      loginWithCode: vi.fn(async () => undefined),
    } },
    addEmbeddedTaprootWallet: add,
    signEmbeddedTaprootHash: sign,
    dispose: vi.fn(),
  } satisfies PrivyAuthClient;
  const prepare = vi.fn(async () => ({ assignment_id: "assignment-1", network: "mainnet" as const, may_create: false }));
  const status = vi.fn(async (): Promise<PostPersonasPersonaIdWalletsSpacesTaprootStatusResponse> =>
    ({ kind: "pending", assignment_id: "assignment-1", network: "mainnet" }));
  const confirm = vi.fn(async () => ({ assignment_id: "assignment-1", network: "mainnet" as const,
    address: "bc1p-test", output_script_hex: "5120", replay: false }));
  // SAFETY: these three mocks implement the exact methods exercised by the session.
  const apiClient = {
    post_personasPersonaIdWalletsSpacesTaprootPrepare: prepare,
    post_personasPersonaIdWalletsSpacesTaprootStatus: status,
    post_personasPersonaIdWalletsSpacesTaprootConfirm: confirm,
  } as SessionSpacesTaprootApiClient;
  return { privy, apiClient, add, sign, prepare, status, confirm };
}

describe("Spaces Taproot wallet setup", () => {
  test("never repeats an uncertain provider add in the same authorization", async () => {
    const state = fixture();
    state.prepare.mockResolvedValue({ assignment_id: "assignment-1", network: "mainnet", may_create: true });
    state.add.mockRejectedValueOnce(new Error("provider timeout"));
    const session = await createSpacesTaprootWalletSession({ config, apiClient: state.apiClient,
      factory: async () => state.privy });
    await session.loginWithCode("member@example.test", "123456");
    await expect(session.setup("persona-1", csrf)).rejects.toThrow("provider timeout");
    await expect(session.setup("persona-1", csrf)).rejects.toThrow("wallet_creation_in_progress");
    expect(state.add).toHaveBeenCalledTimes(1);
    expect(state.prepare).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  test("reconciles a candidate and signs only the server challenge", async () => {
    const state = fixture();
    state.status.mockResolvedValueOnce({ kind: "candidate", assignment_id: "assignment-1",
      network: "mainnet", provider_wallet_id: "wallet-1", address: "bc1p-test",
      output_script_hex: "5120", challenge_digest_hex: "cd".repeat(32) });
    state.status.mockResolvedValueOnce({ kind: "active", assignment_id: "assignment-1",
      network: "mainnet", provider_wallet_id: "wallet-1", address: "bc1p-test", output_script_hex: "5120" });
    const session = await createSpacesTaprootWalletSession({ config, apiClient: state.apiClient,
      factory: async () => state.privy });
    await session.loginWithCode("member@example.test", "123456");
    await expect(session.setup("persona-1", csrf)).resolves.toMatchObject({ kind: "active", provider_wallet_id: "wallet-1" });
    expect(state.add).not.toHaveBeenCalled();
    expect(state.sign).toHaveBeenCalledWith("wallet-1", "cd".repeat(32));
    expect(state.confirm).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({
      assignment_id: "assignment-1", provider_wallet_id: "wallet-1", signature_hex: "ab".repeat(64),
    }) }), expect.anything());
    session.dispose();
  });
});

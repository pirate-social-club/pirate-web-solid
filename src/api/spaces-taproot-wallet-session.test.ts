import { describe, expect, test, vi } from "vitest";
import { ApiClientError, type PostPersonasPersonaIdWalletsSpacesTaprootStatusResponse } from "@pirate/api-client";
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
    ({ kind: "prepared", assignment_id: "assignment-1", network: "mainnet" }));
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
  test("only a missing assignment proceeds from status to a one-create server grant", async () => {
    const state = fixture();
    state.status.mockRejectedValueOnce(new ApiClientError(
      { status: 404, code: "not_found", name: "NotFound", retryable: false },
      { error: { code: "not_found", message: "No assignment", retryable: false } },
    ));
    state.status.mockResolvedValueOnce({ kind: "active", assignment_id: "assignment-1", network: "mainnet", provider_wallet_id: "wallet-1", address: "bc1p-test", output_script_hex: "5120" });
    state.prepare.mockResolvedValue({ assignment_id: "assignment-1", network: "mainnet", may_create: true });
    const session = await createSpacesTaprootWalletSession({ config, apiClient: state.apiClient, factory: async () => state.privy });
    await session.loginWithCode("member@example.test", "123456");
    await expect(session.setup("persona-1", csrf)).resolves.toMatchObject({ kind: "active" });
    expect(state.status).toHaveBeenCalledTimes(2);
    expect(state.prepare).toHaveBeenCalledTimes(1);
    expect(state.add).toHaveBeenCalledTimes(1);
    expect(state.status.mock.invocationCallOrder[0]).toBeLessThan(state.prepare.mock.invocationCallOrder[0]!);
    session.dispose();
  });

  test("an uncertain status read or unsupported wire network permits no creation", async () => {
    for (const unsupported of [false, true]) {
      const state = fixture();
      if (unsupported) {
        // SAFETY: deliberately invalid wire data proves refusal before effects.
        state.status.mockResolvedValue(JSON.parse('{"kind":"prepared","assignment_id":"assignment-1","network":"regtest"}') as PostPersonasPersonaIdWalletsSpacesTaprootStatusResponse);
      } else state.status.mockRejectedValue(new Error("status outcome unknown"));
      const session = await createSpacesTaprootWalletSession({ config, apiClient: state.apiClient, factory: async () => state.privy });
      await session.loginWithCode("member@example.test", "123456");
      await expect(session.setup("persona-1", csrf)).rejects.toThrow(unsupported ? "wallet_network_unsupported" : "status outcome unknown");
      expect(state.prepare).not.toHaveBeenCalled();
      expect(state.add).not.toHaveBeenCalled();
      expect(state.sign).not.toHaveBeenCalled();
      session.dispose();
    }
  });

  test("overlapping setup replies cannot call provider add twice", async () => {
    const state = fixture();
    state.prepare.mockResolvedValue({ assignment_id: "assignment-1", network: "mainnet", may_create: true });
    let finishAdd = () => {};
    state.add.mockImplementationOnce(() => new Promise(resolve => { finishAdd = () => resolve(undefined); }));
    const session = await createSpacesTaprootWalletSession({ config, apiClient: state.apiClient, factory: async () => state.privy });
    await session.loginWithCode("member@example.test", "123456");
    const outcomes = Promise.allSettled([session.setup("persona-1", csrf), session.setup("persona-1", csrf)]);
    await vi.waitFor(() => expect(state.add).toHaveBeenCalledTimes(1));
    state.status.mockResolvedValue({ kind: "active", assignment_id: "assignment-1", network: "mainnet", provider_wallet_id: "wallet-1", address: "bc1p-test", output_script_hex: "5120" });
    finishAdd();
    const results = await outcomes;
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.message).toBe("wallet_creation_in_progress");
    expect(state.add).toHaveBeenCalledTimes(1);
    session.dispose();
  });
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
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.sign).toHaveBeenCalledWith("wallet-1", "cd".repeat(32));
    expect(state.confirm).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({
      assignment_id: "assignment-1", provider_wallet_id: "wallet-1", signature_hex: "ab".repeat(64),
    }) }), expect.anything());
    session.dispose();
  });

  test("checks retained pending and active status without another preparation or creation", async () => {
    for (const result of [
      { kind: "pending", assignment_id: "assignment-1", network: "mainnet" },
      { kind: "ambiguous", assignment_id: "assignment-1", network: "mainnet" },
      { kind: "active", assignment_id: "assignment-1", network: "mainnet", provider_wallet_id: "wallet-1", address: "bc1p-test", output_script_hex: "5120" },
    ] as const) {
      const state = fixture();
      state.status.mockResolvedValue(result);
      const session = await createSpacesTaprootWalletSession({ config, apiClient: state.apiClient, factory: async () => state.privy });
      await session.loginWithCode("member@example.test", "123456");
      await expect(session.setup("persona-1", csrf)).resolves.toEqual(result);
      expect(state.prepare).not.toHaveBeenCalled();
      expect(state.add).not.toHaveBeenCalled();
      expect(state.sign).not.toHaveBeenCalled();
      session.dispose();
    }
  });

  test("disposal while preparation is pending prevents provider creation", async () => {
    const state = fixture();
    let finish: (value: Awaited<ReturnType<typeof state.prepare>>) => void = () => {};
    state.prepare.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const session = await createSpacesTaprootWalletSession({ config, apiClient: state.apiClient, factory: async () => state.privy });
    await session.loginWithCode("member@example.test", "123456");
    const setup = session.setup("persona-1", csrf);
    const observed = expect(setup).rejects.toThrow("wallet_session_closed");
    await vi.waitFor(() => expect(state.prepare).toHaveBeenCalledTimes(1));
    session.dispose();
    finish({ assignment_id: "assignment-1", network: "mainnet", may_create: true });
    await observed;
    expect(state.add).not.toHaveBeenCalled();
    expect(state.confirm).not.toHaveBeenCalled();
    expect(state.status).toHaveBeenCalledTimes(1);
  });

  test("disposal during status lookup prevents later signing, preparation and confirmation", async () => {
    const state = fixture();
    let finish: (value: PostPersonasPersonaIdWalletsSpacesTaprootStatusResponse) => void = () => {};
    state.status.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const session = await createSpacesTaprootWalletSession({ config, apiClient: state.apiClient, factory: async () => state.privy });
    await session.loginWithCode("member@example.test", "123456");
    const setup = session.setup("persona-1", csrf);
    const observed = expect(setup).rejects.toThrow("wallet_session_closed");
    await vi.waitFor(() => expect(state.status).toHaveBeenCalledTimes(1));
    session.dispose();
    finish({ kind: "candidate", assignment_id: "assignment-1", network: "mainnet", provider_wallet_id: "wallet-1", address: "bc1p-test", output_script_hex: "5120", challenge_digest_hex: "cd".repeat(32) });
    await observed;
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.add).not.toHaveBeenCalled();
    expect(state.sign).not.toHaveBeenCalled();
    expect(state.confirm).not.toHaveBeenCalled();
  });

  test("disposal during signing prevents confirmation", async () => {
    const state = fixture();
    state.status.mockResolvedValue({ kind: "candidate", assignment_id: "assignment-1", network: "mainnet", provider_wallet_id: "wallet-1", address: "bc1p-test", output_script_hex: "5120", challenge_digest_hex: "cd".repeat(32) });
    let finish: (value: string) => void = () => {};
    state.sign.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const session = await createSpacesTaprootWalletSession({ config, apiClient: state.apiClient, factory: async () => state.privy });
    await session.loginWithCode("member@example.test", "123456");
    const setup = session.setup("persona-1", csrf);
    const observed = expect(setup).rejects.toThrow("wallet_session_closed");
    await vi.waitFor(() => expect(state.sign).toHaveBeenCalledTimes(1));
    session.dispose();
    finish("ab".repeat(64));
    await observed;
    expect(state.confirm).not.toHaveBeenCalled();
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.add).not.toHaveBeenCalled();
  });
});

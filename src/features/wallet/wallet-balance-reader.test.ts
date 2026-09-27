import { afterEach, expect, test, vi } from "vitest";
import { readWalletBalances } from "./wallet-balance-reader";
import { walletNetworkCatalog } from "./wallet-network-catalog";

afterEach(() => vi.unstubAllGlobals());
test("reads the assigned address without credentials and preserves partial token failures", async () => {
  const address = "0x1111111111111111111111111111111111111111";
  const networks = walletNetworkCatalog("mainnet");
  const calls: { method: string; params: string[] }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    const body = JSON.parse(String(init.body));
    calls.push(body);
    const network = networks.find(item => new URL(item.chain.rpcUrls.default.http[0]!).href === new URL(url).href)!;
    if (body.method === "eth_call" && network.chainId === "base") return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "unavailable" } });
    const result = body.method === "eth_chainId" ? `0x${network.chain.id.toString(16)}` : body.method === "eth_call" ? `0x${(12345678n).toString(16).padStart(64, "0")}` : "0xde0b6b3a7640000";
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  }));
  const sections = await readWalletBalances(address, "mainnet", new AbortController().signal);
  expect(sections[0]!.tokens.map(token => token.balance)).toEqual(["1", "12.345678"]);
  expect(sections[1]!.tokens[0]!.balance).toBe("1");
  expect(sections[2]!.tokens.map(token => token.balance)).toEqual(["1", "Unavailable"]);
  expect(sections[2]!.balancesUnavailable).toBe(true);
  expect(calls.filter(call => call.method === "eth_getBalance").every(call => call.params[0] === address)).toBe(true);
  expect(JSON.stringify(calls)).not.toContain("persona");
});

test("wrong-chain RPC responses never become plausible balances", async () => {
  const methods: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); methods.push(body.method);
    return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x1" });
  }));
  const sections = await readWalletBalances("0x1111111111111111111111111111111111111111", "testnet", new AbortController().signal);
  expect(methods).toEqual(["eth_chainId", "eth_chainId", "eth_chainId"]);
  expect(sections.every(section => section.tokens.every(token => token.balance === "Unavailable"))).toBe(true);
});

import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { publishFreshHnsSessionOnRegtest, stagingCopyCommand, verifyRegtestRunnerOnHost, type HnsSshTransport } from "../e2e/fixtures/hns-regtest-publisher.ts";

const identity = { communityId: "community_fixture", root: "e2eabc123", sessionId: "session_fixture" };
const url = "https://web-next-staging.pirate.sc/api/communities/community_fixture/hns-root-imports/session_fixture";
const planHash = "a".repeat(64);
const runnerHash = "b".repeat(64);
const bytes = new TextEncoder().encode(JSON.stringify({
  community_id: identity.communityId,
  root_import_session_id: identity.sessionId,
  root_label: identity.root,
  status: "awaiting_owner_update",
  publish_plan: { version: "pirate-hns-root-import-publish-plan-v1" },
  publish_plan_sha256: planHash,
}));
const digest = createHash("sha256").update(bytes).digest("hex");
const remotePath = "/var/tmp/pirate-hns-handoff-AbC123xYz9/session-response.json";

test("the actual copy shell stores exact bytes privately", async () => {
  const child = spawn("sh", ["-c", stagingCopyCommand], { stdio: ["pipe", "pipe", "pipe"] });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stdin.end(bytes);
  const exit = await new Promise<number | null>(resolve => child.once("close", resolve));
  expect(exit).toBe(0);
  const output = Buffer.concat(chunks).toString("utf8").trim();
  const matched = /^([0-9a-f]{64})  (\/var\/tmp\/pirate-hns-handoff-[A-Za-z0-9]{10}\/session-response\.json)$/u.exec(output);
  if (!matched) throw new Error("Copy fixture did not return its bounded output path.");
  const directory = dirname(matched[2]!);
  try {
    expect(matched[1]).toBe(digest);
    expect(await readFile(matched[2]!)).toEqual(Buffer.from(bytes));
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(matched[2]!)).mode & 0o777).toBe(0o600);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("runner preflight is read-only and refuses a wrong installed bundle", async () => {
  const commands: string[] = [];
  const transport: HnsSshTransport = async (command, input) => {
    commands.push(command);
    expect(input.byteLength).toBe(0);
    return `${runnerHash}  /opt/pirate-hns-staging/journey-chain.js`;
  };
  await verifyRegtestRunnerOnHost(runnerHash, transport);
  expect(commands).toEqual(["sha256sum /opt/pirate-hns-staging/journey-chain.js"]);
  await expect(verifyRegtestRunnerOnHost("c".repeat(64), transport)).rejects.toThrow("does not match");
});

test("protected copy precedes exactly one digest-bound fixture UPDATE", async () => {
  const calls: { command: string; input: Uint8Array; timeout: number }[] = [];
  const transport: HnsSshTransport = async (command, input, timeout) => {
    calls.push({ command, input, timeout });
    if (calls.length === 1) return `${digest}  ${remotePath}`;
    return JSON.stringify({ outcome: "published", root: identity.root, response_sha256: digest, txid: "c".repeat(64) });
  };
  const result = await publishFreshHnsSessionOnRegtest(bytes, url, identity, planHash, runnerHash, transport);
  expect(result).toMatchObject({ root: identity.root, responseSha256: digest, outcome: "published", remotePath });
  expect(calls).toHaveLength(2);
  expect(calls[0]!.input).toEqual(bytes);
  expect(calls[0]!.command).toContain("umask 077");
  expect(calls[0]!.command).toContain("mktemp -d /var/tmp/pirate-hns-handoff-XXXXXXXXXX");
  expect(calls[1]!.input.byteLength).toBe(0);
  expect(calls[1]!.command).toContain(`--root ${identity.root} --plan ${remotePath} --response-sha256 ${digest}`);
  expect(calls[1]!.command).toContain(`= ${runnerHash}`);
  expect(calls[1]!.timeout).toBe(120_000);
});

test("drift, malformed roots and missing runner approval cause zero network calls", async () => {
  let calls = 0;
  const transport: HnsSshTransport = async () => { calls++; return ""; };
  await expect(publishFreshHnsSessionOnRegtest(bytes, url, identity, "d".repeat(64), runnerHash, transport)).rejects.toThrow("plan changed");
  await expect(publishFreshHnsSessionOnRegtest(bytes, url, { ...identity, root: "0qcm;id" }, planHash, runnerHash, transport)).rejects.toThrow("generated e2e root");
  await expect(publishFreshHnsSessionOnRegtest(bytes, url, identity, planHash, "", transport)).rejects.toThrow("runner digest");
  expect(calls).toBe(0);
});

test("copy mismatch or untrusted remote path never reaches publish", async () => {
  for (const copy of [`${"d".repeat(64)}  ${remotePath}`, `${digest}  /tmp/other.json`]) {
    let calls = 0;
    const transport: HnsSshTransport = async () => { calls++; return copy; };
    await expect(publishFreshHnsSessionOnRegtest(bytes, url, identity, planHash, runnerHash, transport)).rejects.toThrow("copy did not verify");
    expect(calls).toBe(1);
  }
});

test("ambiguous dispatch is stop-only with no automatic retry", async () => {
  let calls = 0;
  const copies: unknown[] = [];
  const transport: HnsSshTransport = async () => {
    calls++;
    if (calls === 1) return `${digest}  ${remotePath}`;
    throw new Error("connection lost after remote dispatch");
  };
  await expect(publishFreshHnsSessionOnRegtest(bytes, url, identity, planHash, runnerHash, transport,
    receipt => { copies.push(receipt); })).rejects.toThrow("never retry automatically");
  expect(calls).toBe(2);
  expect(copies).toEqual([{ root: identity.root, remotePath, responseSha256: digest }]);
});

test("a malformed publication receipt is ambiguous rather than accepted", async () => {
  let calls = 0;
  const transport: HnsSshTransport = async () => {
    calls++;
    if (calls === 1) return `${digest}  ${remotePath}`;
    return JSON.stringify({ outcome: "published", root: identity.root, response_sha256: digest, txid: "missing" });
  };
  await expect(publishFreshHnsSessionOnRegtest(bytes, url, identity, planHash, runnerHash, transport)).rejects.toThrow("did not reconcile");
  expect(calls).toBe(2);
});

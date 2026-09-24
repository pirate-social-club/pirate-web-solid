import { spawn } from "node:child_process";
import { inspectHnsSessionResponse, requireHnsJourneyRoot, type HnsSessionIdentity } from "./hns-session-handoff.ts";

const HOST = "ubuntu@94.103.168.209";
const RUNNER = "/opt/pirate-hns-staging/journey-chain.js";
const SHA256 = /^[0-9a-f]{64}$/u;
const REMOTE_RESPONSE = /^\/var\/tmp\/pirate-hns-handoff-[A-Za-z0-9]{10}\/session-response\.json$/u;
const SSH_OPTIONS = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
  "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=1"];

export type HnsSshTransport = (command: string, input: Uint8Array, timeoutMs: number) => Promise<string>;
export type HnsProtectedCopyReceipt = Readonly<{
  root: string;
  remotePath: string;
  responseSha256: string;
}>;

/** Never retain SSH stderr: an unexpected remote error can echo request bytes. */
export const sshToStagingHost: HnsSshTransport = (command, input, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn("ssh", [...SSH_OPTIONS, HOST, command], {
    shell: false,
    stdio: ["pipe", "pipe", "ignore"],
    // The Worker augments ProcessEnv with required bindings; SSH receives only
    // these local transport fields, never the E2E credential environment.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK } as unknown as NodeJS.ProcessEnv,
  });
  const chunks: Buffer[] = [];
  let length = 0;
  let failed = false;
  const timer = setTimeout(() => { failed = true; child.kill("SIGKILL"); }, timeoutMs);
  child.stdout.on("data", (chunk: Buffer) => {
    length += chunk.length;
    if (length > 65_536) { failed = true; child.kill("SIGKILL"); }
    else chunks.push(chunk);
  });
  child.stdin.on("error", () => { failed = true; child.kill("SIGKILL"); });
  child.once("error", () => {
    clearTimeout(timer);
    reject(new Error("Staging SSH transport failed; outcome must be reconciled before retry."));
  });
  child.once("close", code => {
    clearTimeout(timer);
    if (failed || code !== 0) reject(new Error("Staging SSH transport failed; outcome must be reconciled before retry."));
    else resolve(Buffer.concat(chunks).toString("utf8").trim());
  });
  child.stdin.end(input);
});

export const stagingCopyCommand = [
  "set -eu",
  "umask 077",
  "d=$(mktemp -d /var/tmp/pirate-hns-handoff-XXXXXXXXXX)",
  'f="$d/session-response.json"',
  'cat > "$f"',
  'sha256sum "$f"',
].join("; ");

export async function verifyRegtestRunnerOnHost(
  runnerSha256: string,
  transport: HnsSshTransport = sshToStagingHost,
) {
  if (!SHA256.test(runnerSha256)) throw new Error("Reviewed regtest runner digest is required.");
  const raw = await transport(`sha256sum ${RUNNER}`, new Uint8Array(), 15_000);
  if (raw !== `${runnerSha256}  ${RUNNER}`)
    throw new Error("Staging host regtest runner does not match its reviewed digest.");
}

function publishCommand(root: string, remotePath: string, responseSha256: string, runnerSha256: string) {
  // Every interpolated field is validated before this string reaches SSH's remote shell.
  return `set -eu; test "$(sha256sum ${RUNNER} | cut -d' ' -f1)" = ${runnerSha256}; ` +
    `bun ${RUNNER} publish --root ${root} --plan ${remotePath} --response-sha256 ${responseSha256}`;
}

/** A fresh authenticated browser response is the only caller input. The
 * fixture host receives its bytes privately, checks the digest itself, then
 * invokes the pinned regtest runner once. Any uncertain result is stop-only. */
export async function publishFreshHnsSessionOnRegtest(
  bytes: Uint8Array,
  url: string,
  identity: HnsSessionIdentity,
  expectedPlanSha256: string,
  runnerSha256: string,
  transport: HnsSshTransport = sshToStagingHost,
  onCopied?: (receipt: HnsProtectedCopyReceipt) => Promise<void> | void,
) {
  requireHnsJourneyRoot(identity.root);
  const inspected = inspectHnsSessionResponse(bytes, url, identity);
  if (!SHA256.test(expectedPlanSha256) || inspected.publishPlanSha256 !== expectedPlanSha256)
    throw new Error("HNS publication plan changed since the authenticated preparation read.");
  if (!SHA256.test(runnerSha256)) throw new Error("Reviewed regtest runner digest is required.");
  const copy = await transport(stagingCopyCommand, bytes, 30_000);
  const matched = /^([0-9a-f]{64})  (\/var\/tmp\/[^\s]+)$/u.exec(copy);
  if (!matched || matched[1] !== inspected.sha256 || !REMOTE_RESPONSE.test(matched[2]!))
    throw new Error("Protected staging copy did not verify; no chain command was sent.");
  const copyReceipt = { root: identity.root, remotePath: matched[2]!, responseSha256: inspected.sha256 };
  await onCopied?.(copyReceipt);
  let raw: string;
  try {
    raw = await transport(publishCommand(identity.root, matched[2]!, inspected.sha256, runnerSha256), new Uint8Array(), 120_000);
  } catch {
    throw new Error("Regtest UPDATE outcome is ambiguous; inspect chain and host receipt, never retry automatically.");
  }
  let result: Record<string, unknown>;
  try { result = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new Error("Regtest UPDATE response is ambiguous; inspect chain and host receipt, never retry automatically."); }
  if ((result.outcome !== "published" && result.outcome !== "already_current") ||
      result.root !== identity.root || result.response_sha256 !== inspected.sha256 ||
      (result.outcome === "published" && (typeof result.txid !== "string" || !SHA256.test(result.txid))))
    throw new Error("Regtest UPDATE response did not reconcile; inspect chain and host receipt, never retry automatically.");
  return { root: identity.root, remotePath: matched[2]!, responseSha256: inspected.sha256,
    publishPlanSha256: inspected.publishPlanSha256, outcome: result.outcome, txid: result.txid ?? null };
}

import { spawn } from "node:child_process";
import { inspectHnsSessionResponse, requireHnsJourneyRoot, type HnsSessionIdentity } from "./hns-session-handoff.ts";

const HOST = "ubuntu@94.103.168.209";
const RUNNER = "/opt/pirate-hns-staging/journey-chain.js";
const SHA256 = /^[0-9a-f]{64}$/u;
const REMOTE_RESPONSE = /^\/var\/tmp\/pirate-hns-handoff-[A-Za-z0-9]{10}\/session-response\.json$/u;
const SSH_OPTIONS = ["-F", "/dev/null", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
  "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=1"];

export class HnsRegtestRefusal extends Error {
  constructor(readonly code: string) {
    super(`Regtest runner refused with ${code}; inspect its host receipt before any retry.`);
  }
}

/** A failure after the runner's dispatch claim: an update may already be on
 * chain. Never a refusal, never retried; carries a txid only if the wallet
 * returned one. */
export class HnsRegtestDispatchAmbiguous extends Error {
  constructor(readonly code: string, readonly txid: string | null, readonly receipt: string) {
    super(`Regtest UPDATE dispatch is ambiguous (${code}${txid ? `, txid ${txid}` : ", no txid"}); ` +
      `reconcile the chain and the host receipt ${receipt} by hand, never retry automatically.`);
  }
}

const RECEIPT = /^\/[A-Za-z0-9._/-]+\/publish-e2e[a-z0-9]{6,40}\.json$/u;

function fixedRecord(stderr: string): Record<string, unknown> | null {
  if (stderr.length > 4096) return null;
  let value: unknown;
  try { value = JSON.parse(stderr.trim()) as unknown; }
  catch { return null; }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || !/^[a-z][a-z0-9_]{0,80}$/u.test(record.code)) return null;
  return record;
}

/** Exit 1 with exactly {outcome, code}: a definite refusal before any claim. */
export function fixedRegtestRefusal(stderr: string, exitCode = 1): HnsRegtestRefusal | null {
  const record = fixedRecord(stderr);
  if (!record || exitCode !== 1 || record.outcome !== "journey_chain_refused" ||
      Object.keys(record).length !== 2)
    return null;
  return new HnsRegtestRefusal(record.code as string);
}

/** Exit 3 with the exact post-claim shape. Anything malformed stays a generic
 * ambiguity, never a refusal. */
export function fixedRegtestDispatchAmbiguity(stderr: string, exitCode = 3): HnsRegtestDispatchAmbiguous | null {
  const record = fixedRecord(stderr);
  if (!record || exitCode !== 3 || record.outcome !== "journey_chain_dispatch_ambiguous" ||
      JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(["code", "outcome", "receipt", "root", "txid"]) ||
      !(record.txid === null || (typeof record.txid === "string" && SHA256.test(record.txid))) ||
      typeof record.receipt !== "string" || !RECEIPT.test(record.receipt))
    return null;
  return new HnsRegtestDispatchAmbiguous(record.code as string, record.txid as string | null, record.receipt);
}

export type HnsSshTransport = (command: string, input: Uint8Array, timeoutMs: number) => Promise<string>;
export type HnsProtectedCopyReceipt = Readonly<{
  root: string;
  remotePath: string;
  responseSha256: string;
}>;

/** Retain at most a fixed refusal JSON, never raw SSH stderr. An unexpected
 * remote error could echo request bytes and must not enter logs or receipts. */
export const sshToStagingHost: HnsSshTransport = (command, input, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn("ssh", [...SSH_OPTIONS, HOST, command], {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    // The Worker augments ProcessEnv with required bindings; SSH receives only
    // these local transport fields, never the E2E credential environment.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK } as unknown as NodeJS.ProcessEnv,
  });
  const chunks: Buffer[] = [];
  const errors: Buffer[] = [];
  let length = 0;
  let errorLength = 0;
  let failed = false;
  const timer = setTimeout(() => { failed = true; child.kill("SIGKILL"); }, timeoutMs);
  child.stdout.on("data", (chunk: Buffer) => {
    length += chunk.length;
    if (length > 65_536) { failed = true; child.kill("SIGKILL"); }
    else chunks.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    errorLength += chunk.length;
    if (errorLength > 4096) { failed = true; child.kill("SIGKILL"); }
    else errors.push(chunk);
  });
  child.stdin.on("error", () => { failed = true; child.kill("SIGKILL"); });
  child.once("error", () => {
    clearTimeout(timer);
    reject(new Error("Staging SSH transport failed; outcome must be reconciled before retry."));
  });
  child.once("close", code => {
    clearTimeout(timer);
    if (failed || code !== 0) {
      const stderr = Buffer.concat(errors).toString("utf8");
      const outcome = failed ? null
        : fixedRegtestRefusal(stderr, code ?? -1) ?? fixedRegtestDispatchAmbiguity(stderr, code ?? -1);
      reject(outcome ?? new Error("Staging SSH transport failed; outcome must be reconciled before retry."));
    }
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

type RegtestStep = "begin" | "acquire" | "advance-safe" | "end";

/** Commands use the same reviewed runner and root grammar as publication.
 * Any uncertain transport or malformed receipt is stop-only. */
export async function runRegtestJourneyStep(
  step: RegtestStep,
  root: string,
  runnerSha256: string,
  plan?: { remotePath: string; responseSha256: string },
  transport: HnsSshTransport = sshToStagingHost,
) {
  if (step !== "begin" && step !== "acquire" && step !== "advance-safe" && step !== "end")
    throw new Error("Unexpected regtest journey command.");
  requireHnsJourneyRoot(root);
  if (!SHA256.test(runnerSha256)) throw new Error("Reviewed regtest runner digest is required.");
  if (step === "advance-safe") {
    if (!plan || !REMOTE_RESPONSE.test(plan.remotePath) || !SHA256.test(plan.responseSha256))
      throw new Error("Safe advancement requires the verified protected-copy receipt.");
  } else if (plan) throw new Error("Unexpected plan on regtest journey step.");
  const argumentsForStep = step === "advance-safe"
    ? ` --plan ${plan!.remotePath} --response-sha256 ${plan!.responseSha256}` : "";
  const command = `set -eu; test "$(sha256sum ${RUNNER} | cut -d' ' -f1)" = ${runnerSha256}; ` +
    `bun ${RUNNER} ${step} --root ${root}${argumentsForStep}`;
  let raw: string;
  try {
    raw = await transport(command, new Uint8Array(), step === "advance-safe" ? 180_000 : 120_000);
  } catch (error) {
    if (error instanceof HnsRegtestRefusal || error instanceof HnsRegtestDispatchAmbiguous) throw error;
    throw new Error(`Regtest ${step} outcome is ambiguous; inspect the host before any retry.`);
  }
  let result: Record<string, unknown>;
  try { result = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new Error(`Regtest ${step} response is ambiguous; inspect the host before any retry.`); }
  const expected = { begin: "lease_taken", acquire: "acquired", "advance-safe": "safe", end: "lease_released" }[step];
  if (result.outcome !== expected || result.root !== root ||
      (step === "advance-safe" && result.response_sha256 !== plan?.responseSha256))
    throw new Error(`Regtest ${step} response did not reconcile; inspect the host before any retry.`);
  return result;
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
  } catch (error) {
    if (error instanceof HnsRegtestRefusal || error instanceof HnsRegtestDispatchAmbiguous) throw error;
    throw new Error("Regtest UPDATE outcome is ambiguous; inspect chain and host receipt, never retry automatically.");
  }
  let result: Record<string, unknown>;
  try { result = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new Error("Regtest UPDATE response is ambiguous; inspect chain and host receipt, never retry automatically."); }
  const dispatched = result.outcome === "published" || result.outcome === "broadcast_unconfirmed";
  if ((!dispatched && result.outcome !== "already_current") ||
      result.root !== identity.root || result.response_sha256 !== inspected.sha256 ||
      (dispatched && (typeof result.txid !== "string" || !SHA256.test(result.txid))))
    throw new Error("Regtest UPDATE response did not reconcile; inspect chain and host receipt, never retry automatically.");
  return { root: identity.root, remotePath: matched[2]!, responseSha256: inspected.sha256,
    publishPlanSha256: inspected.publishPlanSha256, outcome: result.outcome, txid: result.txid ?? null };
}

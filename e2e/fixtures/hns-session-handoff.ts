import { createHash } from "node:crypto";
import { chmod, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STAGING_ORIGIN = "https://web-next-staging.pirate.sc";
const JOURNEY_ROOT = /^e2e[a-z0-9]{6,40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

export type HnsSessionIdentity = Readonly<{
  communityId: string;
  root: string;
  sessionId: string;
}>;

export function requireHnsJourneyRoot(value: string): string {
  if (!JOURNEY_ROOT.test(value)) throw new Error("HNS journey requires a generated e2e root on regtest.");
  return value;
}

export function inspectHnsSessionResponse(
  bytes: Uint8Array,
  url: string,
  expected: HnsSessionIdentity,
) {
  if (bytes.byteLength === 0 || bytes.byteLength > 262_144)
    throw new Error("HNS session response size is outside the bounded handoff.");
  const parsedUrl = new URL(url);
  const expectedPath = `/api/communities/${encodeURIComponent(expected.communityId)}/hns-root-imports/${encodeURIComponent(expected.sessionId)}`;
  if (parsedUrl.origin !== STAGING_ORIGIN || parsedUrl.pathname !== expectedPath || parsedUrl.search || parsedUrl.hash)
    throw new Error("HNS session response did not come from the intended staging API route.");
  let response: Record<string, unknown>;
  try {
    const decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) throw new Error("shape");
    response = decoded as Record<string, unknown>;
  } catch {
    throw new Error("HNS session response is not valid JSON.");
  }
  if (response.community_id !== expected.communityId ||
      response.root_import_session_id !== expected.sessionId ||
      response.root_label !== expected.root)
    throw new Error("HNS session response identity drifted.");
  if (response.status !== "awaiting_owner_update" && response.status !== "observing")
    throw new Error("HNS session is not ready for publication.");
  if (typeof response.publish_plan !== "object" || response.publish_plan === null || Array.isArray(response.publish_plan) ||
      typeof response.publish_plan_sha256 !== "string" || !SHA256.test(response.publish_plan_sha256))
    throw new Error("HNS session has no complete publication plan.");
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    publishPlanSha256: response.publish_plan_sha256,
  };
}

/** Writes exact authenticated response bytes with no cookie, OTP or token.
 * The caller must fetch them through the signed-in browser context. */
export async function writeHnsSessionHandoff(
  bytes: Uint8Array,
  url: string,
  expected: HnsSessionIdentity,
) {
  const inspected = inspectHnsSessionResponse(bytes, url, expected);
  const directory = await mkdtemp(join(tmpdir(), "pirate-hns-session-"));
  try {
    await chmod(directory, 0o700);
    const bodyPath = join(directory, "session-response.json");
    const receiptPath = join(directory, "handoff-receipt.json");
    const receipt = {
      schema: "pirate-hns-staging-session-handoff-v1",
      fetched_at: new Date().toISOString(),
      url,
      community_id: expected.communityId,
      root_import_session_id: expected.sessionId,
      root_label: expected.root,
      response_sha256: inspected.sha256,
      publish_plan_sha256: inspected.publishPlanSha256,
      response_path: bodyPath,
    };
    const bodyFile = await open(bodyPath, "wx", 0o600);
    try { await bodyFile.writeFile(bytes); } finally { await bodyFile.close(); }
    const receiptFile = await open(receiptPath, "wx", 0o600);
    try { await receiptFile.writeFile(`${JSON.stringify(receipt, null, 2)}\n`); } finally { await receiptFile.close(); }
    return { bodyPath, receiptPath, receipt };
  } catch {
    await rm(directory, { recursive: true, force: true });
    throw new Error("HNS session handoff could not be persisted securely.");
  }
}

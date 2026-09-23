import { afterEach, expect, test } from "bun:test";
import { readFile, rm, stat } from "node:fs/promises";
import { inspectHnsSessionResponse, requireHnsJourneyRoot, writeHnsSessionHandoff } from "../e2e/fixtures/hns-session-handoff.ts";

const identity = { communityId: "community_fixture", root: "e2eabc123", sessionId: "session_fixture" };
const url = "https://web-next-staging.pirate.sc/api/communities/community_fixture/hns-root-imports/session_fixture";
const response = {
  community_id: identity.communityId,
  root_import_session_id: identity.sessionId,
  root_label: identity.root,
  status: "awaiting_owner_update",
  publish_plan: { version: "pirate-hns-root-import-publish-plan-v1" },
  publish_plan_sha256: "a".repeat(64),
};
const bytes = new TextEncoder().encode(JSON.stringify(response));
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

test("requires only journey-generated regtest roots", () => {
  expect(requireHnsJourneyRoot(identity.root)).toBe(identity.root);
  for (const root of ["0qcm", "pirate", "e2e", "e2eCAPITAL12"])
    expect(() => requireHnsJourneyRoot(root)).toThrow();
});

test("binds the exact authenticated route and session identity", () => {
  expect(inspectHnsSessionResponse(bytes, url, identity).publishPlanSha256).toBe("a".repeat(64));
  expect(() => inspectHnsSessionResponse(bytes, url.replace("web-next-staging", "pirate"), identity)).toThrow();
  expect(() => inspectHnsSessionResponse(bytes, `${url}?token=not-allowed`, identity)).toThrow();
  expect(() => inspectHnsSessionResponse(bytes, url, { ...identity, sessionId: "other" })).toThrow();
  expect(() => inspectHnsSessionResponse(new TextEncoder().encode(JSON.stringify({ ...response, status: "activated" })), url, identity)).toThrow();
});

test("retains raw response bytes and a sanitized receipt in private files", async () => {
  const handoff = await writeHnsSessionHandoff(bytes, url, identity);
  directories.push(handoff.bodyPath.slice(0, handoff.bodyPath.lastIndexOf("/")));
  expect(await readFile(handoff.bodyPath)).toEqual(Buffer.from(bytes));
  expect((await stat(handoff.bodyPath)).mode & 0o777).toBe(0o600);
  expect((await stat(handoff.receiptPath)).mode & 0o777).toBe(0o600);
  expect((await stat(directories[0]!)).mode & 0o777).toBe(0o700);
  const receipt = await readFile(handoff.receiptPath, "utf8");
  expect(receipt).toContain(handoff.receipt.response_sha256);
  expect(receipt).not.toContain("cookie");
  expect(receipt).not.toContain("token");
});

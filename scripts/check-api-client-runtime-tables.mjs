import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const currentClient = resolve(
  appRoot,
  "node_modules/@pirate/api-client/src/generated/client.ts",
);
// Client 0.65.0 adds persona bindings, video failure reasons and unavailable
// delivery states, plus the HNS publication check. The audited operation set
// retains its success statuses and error envelopes from 0.60.0.
const expectedDigest = "50faab29460a048fbfc29bdbbb96ea3b909352f808ae007bbd79719e1801dfd8";

const operations = [
  "get_personas",
  "post_personas",
  "post_personasPersonaIdRetire",
  "post_personasPersonaIdWalletsEvmPrepare",
  "post_personasPersonaIdWalletsEvmConfirm",
  "post_authSessionExchange",
  "post_authRegister",
  "get_usersMe",
  "get_usersMeCommunityMemberships",
  "get_publicProfilesHandle",
  "get_communitiesCommunityIdJoinEligibility",
  "post_communitiesCommunityIdJoin",
  "post_verificationSessions",
  "post_verificationSessionsProofSessionIdComplete",
  "post_communitiesCommunityIdMediaUploadReservations",
  "post_communitiesCommunityIdMediaPostSubmissions",
  "post_mediaPostSubmissionsSubmissionIdTerms",
  "post_mediaPostSubmissionsSubmissionIdLyrics",
  "post_mediaPostSubmissionsSubmissionIdFinalize",
  "get_mediaPostSubmissionsSubmissionId",
  "post_mediaPostSubmissionsSubmissionIdRetry",
  "post_mediaPostSubmissionsSubmissionIdCancel",
  "post_mediaUploadReservationsReservationIdPartsRenew",
  "get_postsPostId",
  "get_feedHomePublic",
  "get_feedHome",
  "get_publicCommunitiesCommunityRefFeed",
  "get_textContentSubmissionsSubmissionId",
  "post_postsPostIdComments",
  "post_postsPostIdVote",
  "post_postsPostIdClearVote",
  "post_commentsCommentIdReplies",
  "post_commentsCommentIdReports",
  "get_publicPostsBySlug",
  "get_publicPostsByIdPostIdCanonicalRoute",
  "get_publicPostsSitemap",
  "post_communitiesCommunityIdHnsRootImports",
  "get_communitiesCommunityIdHnsRootImportsSessionId",
  "post_communitiesCommunityIdHnsRootImportsSessionIdPoll",
  "post_communitiesCommunityIdHnsRootImportsSessionIdActivate",
];

const tables = [
  ["RESPONSE_SCHEMAS", "Record<string, JsonSchema>"],
  ["SUCCESS_STATUSES", "Record<string, readonly number[]>"],
  ["ERROR_DEFINITIONS", "Record<string, readonly ApiClientErrorDefinition[]>"],
];

function readGeneratedTable(source, name, type) {
  const marker = `const ${name}: ${type} = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Generated client is missing ${name}`);
  const end = source.indexOf("\n};", start);
  if (end < 0) throw new Error(`Generated client has an unterminated ${name}`);
  const objectSource = source
    .slice(start + marker.length, end + 2)
    .replace(/,\s*\}$/u, "\n}");
  return JSON.parse(objectSource);
}

function runtimeTableDigest(path) {
  const source = readFileSync(path, "utf8");
  const hash = createHash("sha256");
  for (const [name, type] of tables) {
    const table = readGeneratedTable(source, name, type);
    for (const operation of operations) {
      if (!(operation in table)) {
        throw new Error(`${path} is missing ${name}.${operation}`);
      }
      hash.update(name);
      hash.update("\0");
      hash.update(operation);
      hash.update("\0");
      hash.update(JSON.stringify(table[operation]));
      hash.update("\0");
    }
  }
  return hash.digest("hex");
}

const args = process.argv.slice(2);
let checked;
if (args.length === 0) {
  checked = [currentClient];
} else if (args.length === 3 && args[0] === "--compare") {
  checked = [resolve(args[1]), resolve(args[2])];
} else {
  throw new Error("Usage: check-api-client-runtime-tables.mjs [--compare <client-a.ts> <client-b.ts>]");
}

const results = checked.map((path) => ({ path, digest: runtimeTableDigest(path) }));
for (const result of results) {
  if (result.digest !== expectedDigest) {
    throw new Error(
      `${result.path} runtime-table digest mismatch: expected ${expectedDigest}, found ${result.digest}`,
    );
  }
}

console.log(JSON.stringify({ operations: operations.length, expectedDigest, clients: results }, null, 2));

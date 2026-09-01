import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = readJson(resolve(appRoot, "package.json"));

const clients = [
  {
    dependency: "@pirate/api-client",
    provenance: "vendor/api-client-provenance.json",
  },
  {
    dependency: "@pirate/api-client-community-route",
    provenance: "vendor/api-client-community-route-provenance.json",
    expectedScope: ["get_cPathSegment", "get_communitiesCommunityIdPreview"],
  },
  {
    dependency: "@pirate/api-client-happy-path",
    provenance: "vendor/api-client-happy-path-provenance.json",
    expectedScope: [
      "post_communityCreationIntents",
      "get_communityCreationIntentsIntentId",
      "patch_communityCreationIntentsIntentId",
      "post_communityCreationIntentsIntentIdCommit",
      "get_postsPostId",
      "get_feedHomePublic",
      "get_feedHome",
      "get_publicCommunitiesCommunityRefFeed",
      "post_communitiesCommunityIdPostsPostIdKaraokeAttempts",
      "get_communitiesCommunityIdPostsPostIdKaraoke",
      "get_communitiesCommunityIdKaraokeAttemptsAttemptId",
      "get_communitiesCommunityIdPostsPostIdKaraokeLeaderboard",
      "delete_usersMeLearnerAudio",
      "get_communitiesCommunityIdPostsPostIdStudyV2",
      "post_communitiesCommunityIdPostsPostIdStudyV2Generations",
      "post_communitiesCommunityIdPostsPostIdStudyV2Sessions",
      "get_communitiesCommunityIdStudyV2SessionsSessionId",
      "post_communitiesCommunityIdStudyV2SessionsSessionIdItemsSessionItemIdAnswers",
    ],
  },
  {
    dependency: "@pirate/api-client-handle-sales",
    provenance: "vendor/api-client-handle-sales-provenance.json",
    expectedScope: [
      "get_communitiesCommunityIdHandleOfferings",
      "get_personas",
      "post_handlePersonaLinkConfirmations",
      "post_handleQuotes",
      "post_handleReservations",
      "post_handleClaims",
      "get_handleClaimsClaimId",
    ],
  },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

for (const client of clients) {
  const provenance = readJson(resolve(appRoot, client.provenance));
  const dependency = packageJson.dependencies?.[client.dependency];
  const expectedDependency = `file:${provenance.artifact}`;
  if (dependency !== expectedDependency) {
    throw new Error(`${client.dependency} must resolve from ${expectedDependency}; found ${dependency ?? "missing"}`);
  }

  const artifactPath = resolve(appRoot, provenance.artifact);
  const artifactSha256 = sha256(artifactPath);
  if (artifactSha256 !== provenance.sha256) {
    throw new Error(`${client.dependency} tarball hash mismatch: expected ${provenance.sha256}, found ${artifactSha256}`);
  }

  const installedRoot = resolve(appRoot, "node_modules", ...client.dependency.split("/"));
  const installedPackage = readJson(resolve(installedRoot, "package.json"));
  const generated = readJson(resolve(installedRoot, "src/generated/provenance.json"));
  if (
    installedPackage.version !== provenance.version
    || generated.version !== provenance.version
    || generated.openapiSha256 !== provenance.openapiSha256
    || generated.clientSha256 !== provenance.clientSha256
  ) {
    throw new Error(`${client.dependency} installed client does not match its recorded provenance`);
  }

  if (client.expectedScope && JSON.stringify(provenance.scope) !== JSON.stringify(client.expectedScope)) {
    throw new Error(`${client.dependency} scope must remain the exact reviewed public route surface`);
  }
}

console.log(JSON.stringify({
  apiClients: clients.map(({ dependency, provenance }) => ({ dependency, provenance })),
}, null, 2));

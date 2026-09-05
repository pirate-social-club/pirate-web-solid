import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = readJson(resolve(appRoot, "package.json"));

const clients = [
  {
    dependency: "@pirate/api-client",
    provenance: "vendor/api-client-provenance.json",
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
      "get_publicPostsBySlug",
      "get_publicPostsByIdPostIdCanonicalRoute",
      "get_publicPostsSitemap",
      "post_communitiesCommunityIdHnsRootImports",
      "get_communitiesCommunityIdHnsRootImports",
      "get_communitiesCommunityIdHnsRootImportsSessionId",
      "post_communitiesCommunityIdHnsRootImportsSessionIdPoll",
      "post_communitiesCommunityIdHnsRootImportsSessionIdActivate",
      "get_usersMeCommunityMemberships",
    ],
  },
];

const permittedDependency = clients[0].dependency;
const generatedDependencies = Object.keys(packageJson.dependencies ?? {})
  .filter((dependency) => dependency.startsWith("@pirate/api-client"));
if (
  generatedDependencies.length !== 1
  || generatedDependencies[0] !== permittedDependency
) {
  throw new Error(
    `Only ${permittedDependency} may be declared; found ${generatedDependencies.join(", ") || "none"}`,
  );
}

const generatedClientSpecifier = /["'](@pirate\/api-client[^"']*)["']/gu;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

for (const path of sourceFiles(resolve(appRoot, "src"))) {
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(generatedClientSpecifier)) {
    if (match[1] !== permittedDependency) {
      throw new Error(`${path} imports forbidden generated-client alias ${match[1]}`);
    }
  }
}

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

}

console.log(JSON.stringify({
  apiClients: clients.map(({ dependency, provenance }) => ({ dependency, provenance })),
}, null, 2));

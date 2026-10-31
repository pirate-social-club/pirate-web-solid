import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function websiteArtifactDigest(root) {
  const hash = createHash("sha256");
  let count = 0;
  async function visit(directory, relative) {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== resolve(directory)) {
      throw new Error("website_production_refused:artifact_directory");
    }
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const name = relative + "/" + entry.name;
      if (entry.isDirectory()) await visit(join(directory, entry.name), name);
      else if (entry.isFile()) {
        const bytes = await readFile(join(directory, entry.name));
        hash.update(name + "\0" + bytes.length + "\0");
        hash.update(bytes); count += 1;
      } else throw new Error("website_production_refused:unsupported_artifact");
    }
  }
  for (const directory of ["ssr", "client"]) await visit(join(root, "dist", directory), directory);
  if (!count) throw new Error("website_production_refused:empty_build");
  return hash.digest("hex");
}

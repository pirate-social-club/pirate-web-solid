import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const workflowDirectory = new URL("../.github/workflows/", import.meta.url);
const fullCommitSha = /^[0-9a-f]{40}$/u;

export function actionReferences(content: string): readonly string[] {
  return content
    .split(/\r?\n/u)
    .map((line) => /^\s*-?\s*uses:\s*(\S+)/u.exec(line)?.[1])
    .filter((reference): reference is string => reference !== undefined);
}

export function isPinnedActionReference(reference: string): boolean {
  if (reference.startsWith("./")) return true;
  const separator = reference.lastIndexOf("@");
  return separator > 0 && fullCommitSha.test(reference.slice(separator + 1));
}

export function actionPinViolations(path: string, content: string): readonly string[] {
  return actionReferences(content)
    .filter((reference) => !isPinnedActionReference(reference))
    .map((reference) => `${path}: action ${reference} is not pinned to a full commit SHA`);
}

export async function repositoryActionPinViolations(): Promise<readonly string[]> {
  const entries = (await readdir(workflowDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const results = await Promise.all(
    entries.map(async (entry) => {
      const path = `.github/workflows/${entry.name}`;
      return actionPinViolations(path, await readFile(new URL(entry.name, workflowDirectory), "utf8"));
    }),
  );
  return results.flat();
}

export async function main(): Promise<void> {
  const violations = await repositoryActionPinViolations();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`action pins verified from ${repositoryRoot}`);
}

if (import.meta.main) await main();

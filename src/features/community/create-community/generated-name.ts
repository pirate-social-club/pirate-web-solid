/**
 * The locally generated profile-name suggestion of Spec 014 §3.1 as amended
 * 2026-09-20: two common lowercase words and a number, like
 * "quiet-harbor-2413", prefilled into the fresh profile's name field and
 * fully editable. Generated on the client from a bundled word list; the
 * 1–80-character rule is the only constraint and no uniqueness is enforced,
 * so there is no retry path.
 */

const ADJECTIVES = [
  "amber", "brave", "calm", "clever", "cosy", "dapper", "eager", "fair",
  "gentle", "happy", "kind", "light", "lucky", "mellow", "misty", "north",
  "open", "proud", "quiet", "swift", "tidy", "warm", "witty", "young",
] as const;

const NOUNS = [
  "anchorage", "beacon", "cabin", "cove", "current", "dune", "falcon",
  "forest", "harbor", "island", "lagoon", "lantern", "marsh", "meadow",
  "orchard", "peak", "pier", "reef", "ridge", "river", "signal", "summit",
  "tide", "valley",
] as const;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** A fresh suggestion, e.g. "quiet-harbor-2413". */
export function generatedPublicName(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${1000 + Math.floor(Math.random() * 9000)}`;
}

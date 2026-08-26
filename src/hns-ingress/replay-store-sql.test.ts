import { describe, expect, it } from "vitest";
import {
  consumeHnsReplayNonce,
  initializeHnsReplaySql,
  type HnsReplaySqlStorage,
} from "./replay-store-sql.ts";

interface MemorySql {
  readonly storage: HnsReplaySqlStorage;
  readonly statements: string[];
}

function memorySql(): MemorySql {
  const rows = new Map<string, number>();
  const statements: string[] = [];
  return {
    statements,
    storage: {
      exec: (query, ...bindings) => {
        statements.push(query);
        if (query.startsWith("DELETE")) {
          const now = bindings[0];
          if (typeof now !== "number") throw new Error("Expected numeric replay time");
          for (const [nonce, expiresAt] of rows) if (expiresAt <= now) rows.delete(nonce);
          return { toArray: () => [] };
        }
        if (query.includes("INSERT OR IGNORE")) {
          const nonce = bindings[0];
          const expiresAt = bindings[1];
          if (typeof nonce !== "string" || typeof expiresAt !== "number") {
            throw new Error("Expected replay nonce bindings");
          }
          if (rows.has(nonce)) return { toArray: () => [] };
          rows.set(nonce, expiresAt);
          return { toArray: () => [{ nonce }] };
        }
        return { toArray: () => [] };
      },
    },
  };
}

describe("SQLite replay fence", () => {
  it("uses a primary key and consumes an unexpired nonce exactly once", () => {
    const memory = memorySql();
    initializeHnsReplaySql(memory.storage);
    expect(memory.statements[0]).toContain("nonce TEXT PRIMARY KEY");
    expect(consumeHnsReplayNonce(memory.storage, "nonce-01", 200, 100)).toBe(true);
    expect(consumeHnsReplayNonce(memory.storage, "nonce-01", 200, 100)).toBe(false);
    expect(memory.statements.some((statement) => statement.includes("INSERT OR IGNORE"))).toBe(true);
  });

  it("prunes expired rows before accepting the same nonce again", () => {
    const memory = memorySql();
    expect(consumeHnsReplayNonce(memory.storage, "nonce-01", 200, 100)).toBe(true);
    expect(consumeHnsReplayNonce(memory.storage, "nonce-01", 301, 300)).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import { projectQueryData } from "./async-query-projection";

describe("async query projection", () => {
  test("keeps stale content visible during revalidation", () => {
    const stale = { service: "api", version: "old" };
    const pending = new Promise<{ service: string; version: string }>(() => undefined);

    expect(projectQueryData(stale, pending)).toBe(stale);
  });

  test("returns the async source when no content is ready", () => {
    const pending = Promise.resolve({ service: "api" });

    expect(projectQueryData(undefined, pending)).toBe(pending);
  });
});

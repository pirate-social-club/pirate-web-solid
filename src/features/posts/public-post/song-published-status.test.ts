import { describe, expect, test } from "vitest";
import { readSongPublishedStatus } from "./song-published-status";

describe("readSongPublishedStatus", () => {
  test.each(["not_applicable", "pending", "ready", "unavailable"] as const)(
    "preserves alignment status %s",
    alignment => expect(readSongPublishedStatus({ alignment, data_registration: "pending" }))
      .toEqual({ alignment, dataRegistration: "pending" }),
  );
  test.each(["pending", "registered", "failed"] as const)(
    "preserves DATA registration status %s",
    dataRegistration => expect(readSongPublishedStatus({ alignment: "ready", data_registration: dataRegistration }))
      .toEqual({ alignment: "ready", dataRegistration }),
  );
  test.each([
    null, [], {},
    { alignment: "unknown", data_registration: "pending" },
    { alignment: "ready", data_registration: "unknown" },
  ])("rejects incomplete or unknown projection %#", value => {
    expect(readSongPublishedStatus(value)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { createBrowserSendMarkerStore, SEND_MARKER_LIFETIME_MS, type SendMarker } from "./winnings-send-marker.ts";

const marker: SendMarker = {
  version: 1, creditId: "credit_1", sender: "0x1111111111111111111111111111111111111111",
  recipient: "0x4444444444444444444444444444444444444444", amountAtomic: "2000000",
  transactionHash: null, startedAt: 1_000,
};

function memory() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const broken = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => { throw new Error("blocked"); },
};

describe("send marker store", () => {
  it("writes to both storages and reads back", () => {
    const local = memory(); const session = memory();
    const store = createBrowserSendMarkerStore(() => 2_000, () => [local, session]);
    store.write(marker);
    expect(local.values.size).toBe(1);
    expect(session.values.size).toBe(1);
    expect(store.read("credit_1")).toEqual(marker);
    expect(store.read("credit_2")).toBeNull();
    store.clear("credit_1");
    expect(store.read("credit_1")).toBeNull();
  });
  it("keeps working when one storage throws", () => {
    const session = memory();
    const store = createBrowserSendMarkerStore(() => 2_000, () => [broken, session]);
    store.write(marker);
    expect(store.read("credit_1")).toEqual(marker);
    expect(() => store.clear("credit_1")).not.toThrow();
  });
  it("never throws when no storage works", () => {
    const store = createBrowserSendMarkerStore(() => 2_000, () => [broken]);
    expect(() => store.write(marker)).not.toThrow();
    expect(store.read("credit_1")).toBeNull();
  });
  it("expires after a day", () => {
    const local = memory();
    let now = marker.startedAt + SEND_MARKER_LIFETIME_MS;
    const store = createBrowserSendMarkerStore(() => now, () => [local]);
    store.write(marker);
    expect(store.read("credit_1")).toEqual(marker);
    now += 1;
    expect(store.read("credit_1")).toBeNull();
    expect(local.values.size).toBe(0);
  });
  it("ignores malformed or mismatched records", () => {
    const local = memory();
    const store = createBrowserSendMarkerStore(() => 2_000, () => [local]);
    local.setItem("pirate.winnings-send.v1.credit_1", "not json");
    expect(store.read("credit_1")).toBeNull();
    local.setItem("pirate.winnings-send.v1.credit_1", JSON.stringify({ ...marker, creditId: "credit_9" }));
    expect(store.read("credit_1")).toBeNull();
    local.setItem("pirate.winnings-send.v1.credit_1", JSON.stringify({ ...marker, transactionHash: "0x12" }));
    expect(store.read("credit_1")).toBeNull();
  });
});

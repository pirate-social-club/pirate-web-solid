/**
 * A per-credit note that a send reached the broadcast step, so reopening the
 * sheet checks that transfer before offering another. It holds only public
 * chain facts (addresses, amount, hash) and expires after a day.
 */
export type SendMarker = Readonly<{
  version: 1;
  creditId: string;
  sender: string;
  recipient: string;
  amountAtomic: string;
  transactionHash: string | null;
  startedAt: number;
}>;

export interface SendMarkerStore {
  read(creditId: string): SendMarker | null;
  write(marker: SendMarker): void;
  clear(creditId: string): void;
}

export const SEND_MARKER_LIFETIME_MS = 24 * 60 * 60 * 1000;
const prefix = "pirate.winnings-send.v1.";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const address = /^0x[0-9a-fA-F]{40}$/u;
const hash = /^0x[0-9a-f]{64}$/u;

function parse(raw: string | null, creditId: string): SendMarker | null {
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (value === null || typeof value !== "object" ||
      !("version" in value) || value.version !== 1 || !("creditId" in value) || value.creditId !== creditId ||
      !("sender" in value) || typeof value.sender !== "string" || !address.test(value.sender) ||
      !("recipient" in value) || typeof value.recipient !== "string" || !address.test(value.recipient) ||
      !("amountAtomic" in value) || typeof value.amountAtomic !== "string" || !/^[1-9][0-9]*$/u.test(value.amountAtomic) ||
      !("transactionHash" in value) || !(value.transactionHash === null ||
        typeof value.transactionHash === "string" && hash.test(value.transactionHash)) ||
      !("startedAt" in value) || typeof value.startedAt !== "number" || !Number.isFinite(value.startedAt)) {
    return null;
  }
  const { sender, recipient, amountAtomic, transactionHash, startedAt } = value;
  return { version: 1, creditId, sender, recipient, amountAtomic, transactionHash, startedAt };
}

/**
 * Written to both localStorage (survives closing the tab) and sessionStorage
 * (survives a blocked localStorage). Every access is guarded: storage can be
 * missing or refuse writes, and the sheet must still work without it.
 */
export function createBrowserSendMarkerStore(
  now: () => number = Date.now,
  storages: () => readonly KeyValueStorage[] = () => {
    const found: KeyValueStorage[] = [];
    try { found.push(window.localStorage); } catch { /* unavailable */ }
    try { found.push(window.sessionStorage); } catch { /* unavailable */ }
    return found;
  },
): SendMarkerStore {
  const each = (operation: (storage: KeyValueStorage) => void) => {
    for (const storage of storages()) {
      try { operation(storage); } catch { /* keep going with the other storage */ }
    }
  };
  const clear = (creditId: string) => each(storage => storage.removeItem(prefix + creditId));
  return {
    read(creditId) {
      let marker: SendMarker | null = null;
      for (const storage of storages()) {
        try { marker = parse(storage.getItem(prefix + creditId), creditId); } catch { marker = null; }
        if (marker !== null) break;
      }
      if (marker === null) return null;
      const age = now() - marker.startedAt;
      if (age < 0 || age > SEND_MARKER_LIFETIME_MS) { clear(creditId); return null; }
      return marker;
    },
    write(marker) {
      const raw = JSON.stringify(marker);
      each(storage => storage.setItem(prefix + marker.creditId, raw));
    },
    clear,
  };
}

/** For tests and stories: the same contract without browser storage. */
export function createMemorySendMarkerStore(initial: readonly SendMarker[] = []): SendMarkerStore {
  const markers = new Map(initial.map(marker => [marker.creditId, marker]));
  return {
    read: creditId => markers.get(creditId) ?? null,
    write: marker => { markers.set(marker.creditId, marker); },
    clear: creditId => { markers.delete(creditId); },
  };
}

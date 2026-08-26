export type HnsReplaySqlCursor = Readonly<{ readonly toArray: () => readonly unknown[] }>;

export type HnsReplaySqlStorage = Readonly<{
  readonly exec: (query: string, ...bindings: readonly unknown[]) => HnsReplaySqlCursor;
}>;

const noncePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

function validUnixSeconds(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function initializeHnsReplaySql(storage: HnsReplaySqlStorage): void {
  storage.exec(
    `CREATE TABLE IF NOT EXISTS hns_forwarder_replay_nonce (
      nonce TEXT PRIMARY KEY,
      expires_at_unix_seconds INTEGER NOT NULL
        CHECK (expires_at_unix_seconds >= 0)
    )`,
  );
}

export function consumeHnsReplayNonce(
  storage: HnsReplaySqlStorage,
  nonce: string,
  expiresAtUnixSeconds: number,
  nowUnixSeconds: number,
): boolean {
  if (
    !noncePattern.test(nonce) ||
    !validUnixSeconds(expiresAtUnixSeconds) ||
    !validUnixSeconds(nowUnixSeconds) ||
    expiresAtUnixSeconds <= nowUnixSeconds
  ) {
    throw new Error("Invalid HNS replay record");
  }
  storage.exec(
    "DELETE FROM hns_forwarder_replay_nonce WHERE expires_at_unix_seconds <= ?",
    nowUnixSeconds,
  );
  const inserted = storage.exec(
    `INSERT OR IGNORE INTO hns_forwarder_replay_nonce (nonce, expires_at_unix_seconds)
     VALUES (?, ?)
     RETURNING nonce`,
    nonce,
    expiresAtUnixSeconds,
  );
  return inserted.toArray().length === 1;
}

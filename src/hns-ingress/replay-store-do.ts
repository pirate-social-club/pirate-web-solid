// The Worker bundle owns this runtime-only import. Node-side unit tests use the
// structural replay adapter and do not construct the Cloudflare class.
import { DurableObject as CloudflareDurableObject } from "cloudflare:workers";
import {
  consumeHnsReplayNonce,
  initializeHnsReplaySql,
  type HnsReplaySqlStorage,
} from "./replay-store-sql.ts";

type DurableObjectStateLike = Readonly<{
  readonly storage: Readonly<{
    readonly sql: HnsReplaySqlStorage;
  }>;
  readonly blockConcurrencyWhile: (callback: () => void | Promise<void>) => void;
}>;

/** SQLite-backed atomic replay fence for one Solid consumer-scope/key shard. */
export class HnsCommunityAppReplayStoreDO extends CloudflareDurableObject {
  private readonly state: DurableObjectStateLike;

  constructor(ctx: DurableObjectStateLike, env: Readonly<Record<never, never>>) {
    // SAFETY: generated Worker types establish the Cloudflare constructor contract;
    // this structural seam only keeps Node-side source traversal independent.
    super(ctx as never, env as never);
    this.state = ctx;
    ctx.blockConcurrencyWhile(() => {
      initializeHnsReplaySql(ctx.storage.sql);
    });
  }

  consume(nonce: string, expiresAtUnixSeconds: number, nowUnixSeconds: number): boolean {
    return consumeHnsReplayNonce(this.state.storage.sql, nonce, expiresAtUnixSeconds, nowUnixSeconds);
  }
}

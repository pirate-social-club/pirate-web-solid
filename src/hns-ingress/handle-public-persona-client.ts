import {
  createPirateApiClient,
  type GetPublicPersonasPersonaIdResponse,
} from "@pirate/api-client-handle-sales";
import { projectPersonaPublicProfile } from "../features/profiles/persona-public-profile/persona-public-profile.model.ts";
import {
  HNS_HANDLE_PUBLIC_PERSONA_DEADLINE_MS,
  HNS_HANDLE_PUBLIC_PERSONA_MAX_BYTES,
  type HnsHandleAuthorityResolutionV1,
} from "./handle-wire.ts";
import { HnsIngressFailure } from "./wire.ts";
import { makeInterruptDeadline } from "./interrupt-deadline.ts";

export type HnsPublicPersonaFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface HnsPublicPersonaClientV1 {
  readonly loadExact: (
    authority: HnsHandleAuthorityResolutionV1,
    signal?: AbortSignal,
  ) => Promise<GetPublicPersonasPersonaIdResponse>;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

function exactHttpsOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("invalid");
    }
    return parsed.origin;
  } catch {
    throw new HnsIngressFailure("misconfigured");
  }
}

async function readBounded(response: Response, interrupt: Promise<never>): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > HNS_HANDLE_PUBLIC_PERSONA_MAX_BYTES)) {
    throw new HnsIngressFailure("upstream_unavailable");
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await Promise.race([reader.read(), interrupt]);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > HNS_HANDLE_PUBLIC_PERSONA_MAX_BYTES) throw new HnsIngressFailure("upstream_unavailable");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function exactGrantCount(
  response: GetPublicPersonasPersonaIdResponse,
  authority: HnsHandleAuthorityResolutionV1,
): number {
  const tuple = authority.hostAuthority;
  return response.handle_grants.filter(grant =>
    grant.grant_id === tuple[3][0] &&
    grant.grant_generation === tuple[3][1] &&
    grant.community_id === authority.communityId &&
    grant.owner_persona.persona_id === authority.ownerPersonaId &&
    grant.sale_namespace_activation_id === tuple[1][0] &&
    grant.sale_namespace_activation_generation === tuple[1][1] &&
    grant.fulfillment.kind === "hosted_persona_v1" &&
    grant.handle.family === "hns" &&
    grant.handle.namespace_root === authority.canonicalRoot &&
    grant.handle.handle_label === authority.canonicalHandleLabel &&
    grant.host.kind === "available" &&
    grant.host.normalized_host === authority.normalizedHost &&
    grant.host.sale_namespace_activation_generation === tuple[1][1] &&
    grant.host.grant_generation === tuple[3][1]
  ).length;
}

export function makeHnsPublicPersonaClientV1(options: {
  readonly origin: string;
  readonly fetchImpl?: HnsPublicPersonaFetch;
}): HnsPublicPersonaClientV1 {
  const origin = exactHttpsOrigin(options.origin);
  return Object.freeze({
    loadExact: async (authority: HnsHandleAuthorityResolutionV1, parentSignal?: AbortSignal) => {
      const expectedUrl = new URL(`/public-personas/${encodeURIComponent(authority.ownerPersonaId)}`, origin).toString();
      const bounded = makeInterruptDeadline(parentSignal, HNS_HANDLE_PUBLIC_PERSONA_DEADLINE_MS);
      const boundedFetch: HnsPublicPersonaFetch = async (input, init) => {
        const actual = new URL(input instanceof Request ? input.url : input.toString()).toString();
        if (actual !== expectedUrl || init?.method !== "GET") throw new HnsIngressFailure("upstream_unavailable");
        const upstream = await Promise.race([
          (options.fetchImpl ?? fetch)(expectedUrl, {
            method: "GET",
            headers: { accept: "application/json" },
            credentials: "omit",
            redirect: "manual",
            signal: bounded.signal,
          }),
          bounded.interrupt,
        ]);
        if (upstream.status === 404) throw new HnsIngressFailure("not_found");
        if (upstream.status !== 200 || upstream.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
          throw new HnsIngressFailure("upstream_unavailable");
        }
        const bytes = await readBounded(upstream, bounded.interrupt);
        return new Response(ownedArrayBuffer(bytes), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      };
      try {
        // SAFETY: the adapter implements only the standard Fetch call shape
        // consumed by the generated client; runtime-specific static members
        // are neither read nor invoked.
        const client = createPirateApiClient(`${origin}/`, {
          credentials: "omit",
          signal: bounded.signal,
          fetchImpl: boundedFetch as typeof fetch,
        });
        const response = await client.get_publicPersonasPersonaId({
          path: { personaId: authority.ownerPersonaId },
        });
        if (projectPersonaPublicProfile(response, authority.ownerPersonaId).kind !== "success" || exactGrantCount(response, authority) !== 1) {
          throw new HnsIngressFailure("upstream_unavailable");
        }
        return response;
      } catch (error) {
        if (parentSignal?.aborted && !bounded.didTimeout()) throw parentSignal.reason ?? error;
        if (error instanceof HnsIngressFailure) throw error;
        throw new HnsIngressFailure("upstream_unavailable");
      } finally {
        bounded.finish();
      }
    },
  });
}

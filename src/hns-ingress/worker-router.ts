import {
  disabledProductionHnsCommunityAppIngressCompositionV2,
  type DisabledHnsCommunityAppIngressCompositionV2,
  type EnabledHnsCommunityAppIngressCompositionV2,
} from "./composition.ts";
import {
  disabledProductionHnsHandlePersonaIngressCompositionV1,
  type DisabledHnsHandlePersonaIngressCompositionV1,
  type EnabledHnsHandlePersonaIngressCompositionV1,
} from "./handle-composition.ts";
import { decodeHnsHandleAuthorityHeader } from "./handle-wire.ts";
import {
  decodeHnsCommunityAuthorityHeader,
  HNS_FORWARDER_AUTHORITY_HEADER,
} from "./wire.ts";

export type HnsWorkerCompositionV2 =
  | EnabledHnsCommunityAppIngressCompositionV2
  | DisabledHnsCommunityAppIngressCompositionV2;

export type HnsHandleWorkerCompositionV1 =
  | EnabledHnsHandlePersonaIngressCompositionV1
  | DisabledHnsHandlePersonaIngressCompositionV1;

export async function routeHnsIngressRequest(input: {
  readonly request: Request;
  readonly community: HnsWorkerCompositionV2;
  readonly handle: HnsHandleWorkerCompositionV1;
  readonly ordinary: (request: Request) => Promise<Response>;
}): Promise<Response> {
  const origin = new URL(input.request.url).origin;
  if (
    input.handle.enabled &&
    input.community.enabled &&
    origin === input.handle.ingressOrigin &&
    origin === input.community.ingressOrigin
  ) {
    const encodedAuthority = input.request.headers.get(HNS_FORWARDER_AUTHORITY_HEADER);
    if (encodedAuthority === null) return new Response(null, { status: 400 });
    try {
      decodeHnsHandleAuthorityHeader(encodedAuthority);
      return input.handle.fetch(input.request);
    } catch {
      try {
        decodeHnsCommunityAuthorityHeader(encodedAuthority);
        return input.community.fetch(input.request);
      } catch {
        return new Response(null, { status: 400 });
      }
    }
  }
  if (input.handle.enabled && origin === input.handle.ingressOrigin) return input.handle.fetch(input.request);
  if (input.community.enabled && origin === input.community.ingressOrigin) return input.community.fetch(input.request);
  const handleRejected = disabledProductionHnsHandlePersonaIngressCompositionV1.rejectReservedHeaders(input.request);
  if (handleRejected !== null) return handleRejected;
  const communityRejected = disabledProductionHnsCommunityAppIngressCompositionV2.rejectReservedHeaders(input.request);
  return communityRejected ?? input.ordinary(input.request);
}

export async function routeHnsCommunityAppIngressRequest(input: {
  readonly request: Request;
  readonly composition: HnsWorkerCompositionV2;
  readonly ordinary: (request: Request) => Promise<Response>;
}): Promise<Response> {
  if (
    input.composition.enabled &&
    new URL(input.request.url).origin === input.composition.ingressOrigin
  ) {
    return input.composition.fetch(input.request);
  }
  const rejected = disabledProductionHnsCommunityAppIngressCompositionV2.rejectReservedHeaders(input.request);
  return rejected ?? input.ordinary(input.request);
}

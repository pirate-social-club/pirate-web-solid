import {
  disabledProductionHnsCommunityAppIngressCompositionV2,
  type DisabledHnsCommunityAppIngressCompositionV2,
  type EnabledHnsCommunityAppIngressCompositionV2,
} from "./composition.ts";

export type HnsWorkerCompositionV2 =
  | EnabledHnsCommunityAppIngressCompositionV2
  | DisabledHnsCommunityAppIngressCompositionV2;

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

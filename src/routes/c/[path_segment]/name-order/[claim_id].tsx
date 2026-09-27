import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";

import SpacesClaimStatus from "../../../../features/communities/handle-storefront/spaces-claim-status.tsx";
import { decodeCommunityRouteParam } from "../../../../features/communities/community-page/community-page-preflight.ts";

export const route = defineFileRoute("/c/:path_segment/name-order/:claim_id", {
  preload: ({ params }) => {
    if (getRequestEvent() !== undefined) httpHeader("Cache-Control", "private, no-store");
    if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(params.claim_id)) httpStatus(404);
    return null;
  },
});

export default function SpacesClaimOrderRoute(props: RouteProps<typeof route>) {
  const pathSegment = decodeCommunityRouteParam(props.params.path_segment);
  const claimId = props.params.claim_id;
  if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(claimId)) return <p role="alert">Registration unavailable.</p>;
  return <SpacesClaimStatus claimId={claimId} communityPath={`/c/${encodeURIComponent(pathSegment)}/names`} />;
}

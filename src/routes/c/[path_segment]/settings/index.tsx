import { useNavigate, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { getRequestEvent } from "@solidjs/web";

import type { OwnerSettingsPreflight } from "../../../../features/community/owner-settings/owner-settings-preflight";
import { queryOwnerSettingsRoute } from "../../../../features/community/owner-settings/owner-settings-route-loader";
import { OwnerSettingsRouteView } from "../../../../features/community/owner-settings/owner-settings-route-view";
import { decodeCommunityRouteParam } from "../../../../features/communities/community-page/community-page-preflight";

/**
 * The management index. It exists so small viewports can drill down into one
 * section at a time and step back out, which needs the list to be a history
 * entry rather than a panel. Direct section links bypass it entirely.
 */
export const route = defineFileRoute("/c/:path_segment/settings", {
  preload: ({ params }) => {
    const decoded = decodeCommunityRouteParam(params.path_segment);
    // SAFETY: entry-server writes this request-local key only after validated API reads.
    const settled = getRequestEvent()?.locals.ownerSettingsPreflight as OwnerSettingsPreflight | undefined;
    if (settled?.requestedPathSegment === decoded) return settled.state;
    return queryOwnerSettingsRoute(decoded);
  },
});

export default function CommunityOwnerSettingsIndexRoute(props: RouteProps<typeof route>) {
  const navigate = useNavigate();
  return (
    <OwnerSettingsRouteView
      navigate={(href, options) => navigate(href, options)}
      requestedSection={null}
      state={props.data}
    />
  );
}

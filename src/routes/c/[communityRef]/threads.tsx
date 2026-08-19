import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";

import { CommunityThreadsPage } from "../../../features/community/community-threads-page.tsx";

export const route = defineFileRoute("/c/:communityRef/threads", {});

export default function CommunityThreadsRoute(props: RouteProps<typeof route>) {
  return <CommunityThreadsPage canonicalPath={`/c/${encodeURIComponent(props.params.communityRef)}/threads`} communityRef={props.params.communityRef} />;
}

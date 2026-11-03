import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { CommunityLeaderboardRouteView, communityLeaderboardQuery } from "../../../features/activity/activity-leaderboard-route.tsx";
import { decodeCommunityRouteParam } from "../../../features/communities/community-page/community-page-preflight.ts";
export const route = defineFileRoute("/c/:path_segment/leaderboard", { preload: ({ params }) => communityLeaderboardQuery(decodeCommunityRouteParam(params.path_segment)) });
export default function LeaderboardRoute(props: RouteProps<typeof route>) { return <CommunityLeaderboardRouteView data={communityLeaderboardQuery(decodeCommunityRouteParam(props.params.path_segment))} />; }

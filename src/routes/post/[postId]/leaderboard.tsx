import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { SongLeaderboardRouteView, songLeaderboardQuery } from "../../../features/activity/activity-leaderboard-route.tsx";
import { captureSessionAuthority } from "../../../api/browser-session-events.ts";
export const route = defineFileRoute("/post/:postId/leaderboard", { preload: ({ params }) => songLeaderboardQuery("id", params.postId, captureSessionAuthority()) });
export default function LeaderboardRoute(props: RouteProps<typeof route>) { return <SongLeaderboardRouteView kind="id" value={props.params.postId} data={songLeaderboardQuery("id", props.params.postId, captureSessionAuthority())} />; }

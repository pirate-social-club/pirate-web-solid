import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { SongLeaderboardRouteView, songLeaderboardQuery } from "../../../features/activity/activity-leaderboard-route.tsx";
import { captureSessionAuthority } from "../../../api/browser-session-events.ts";
export const route = defineFileRoute("/posts/:slug/leaderboard", { preload: ({ params }) => songLeaderboardQuery("slug", params.slug, captureSessionAuthority()) });
export default function LeaderboardRoute(props: RouteProps<typeof route>) { return <SongLeaderboardRouteView kind="slug" value={props.params.slug} data={songLeaderboardQuery("slug", props.params.slug, captureSessionAuthority())} />; }

import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { PublicPostRouteView } from "../../../../features/posts/public-post/public-post-route-view.tsx";
import { preloadPublicPostLegacyRoute } from "../../../../features/posts/public-post/public-post-route-loader.ts";

export const route = defineFileRoute("/p/:postId/karaoke/leaderboard", {
  preload: ({ params }) => preloadPublicPostLegacyRoute(params.postId, "karaoke-leaderboard"),
});

export default function KaraokeLeaderboardRoute(props: RouteProps<typeof route>) {
  return <PublicPostRouteView state={props.data} />;
}

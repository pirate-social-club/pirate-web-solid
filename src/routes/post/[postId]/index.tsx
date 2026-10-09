import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { PublicPostRouteView } from "../../../features/posts/public-post/public-post-route-view.tsx";
import { preloadPublicPostIdRoute } from "../../../features/posts/public-post/public-post-route-loader.ts";

export const route = defineFileRoute("/post/:postId", {
  preload: ({ params }) => preloadPublicPostIdRoute(params.postId),
});

export default function PublicPostIdRoute(props: RouteProps<typeof route>) {
  return <PublicPostRouteView state={props.data} />;
}

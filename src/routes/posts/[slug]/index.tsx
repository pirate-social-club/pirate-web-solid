import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { PublicPostRouteView } from "../../../features/posts/public-post/public-post-route-view.tsx";
import { preloadPublicPostSlugRoute } from "../../../features/posts/public-post/public-post-route-loader.ts";

export const route = defineFileRoute("/posts/:slug", {
  preload: ({ params, location }) => preloadPublicPostSlugRoute(params.slug, "detail", location.pathname + location.search),
});

export default function PublicPostDetailRoute(props: RouteProps<typeof route>) {
  return <PublicPostRouteView state={props.data} />;
}

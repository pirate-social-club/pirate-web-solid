import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { PublicPostRouteView } from "../../../features/posts/public-post/public-post-route-view.tsx";
import { preloadPublicPostSlugRoute } from "../../../features/posts/public-post/public-post-route-loader.ts";

export const route = defineFileRoute("/posts/:slug", {
  preload: ({ params }) => preloadPublicPostSlugRoute(params.slug, "detail"),
});

export default function PublicPostDetailRoute(props: RouteProps<typeof route>) {
  return <PublicPostRouteView state={props.data} />;
}

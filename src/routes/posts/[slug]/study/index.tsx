import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { PublicPostRouteView } from "../../../../features/posts/public-post/public-post-route-view.tsx";
import { queryPublicPostSlugRoute } from "../../../../features/posts/public-post/public-post-route-loader.ts";

export const route = defineFileRoute("/posts/:slug/study", {
  preload: ({ params }) => queryPublicPostSlugRoute(params.slug, "study"),
});

export default function PublicPostStudyRoute(props: RouteProps<typeof route>) {
  return <PublicPostRouteView state={props.data} />;
}

import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { PublicPostRouteView } from "../../../../features/posts/public-post/public-post-route-view.tsx";
import { queryPublicPostLegacyRoute } from "../../../../features/posts/public-post/public-post-route-loader.ts";

export const route = defineFileRoute("/p/:postId/study", {
  preload: ({ params }) => queryPublicPostLegacyRoute(params.postId, "study"),
});

export default function StudyPostRoute(props: RouteProps<typeof route>) {
  return <PublicPostRouteView state={props.data} />;
}

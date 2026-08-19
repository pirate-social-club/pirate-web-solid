/** @jsxImportSource @solidjs/web */
import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";

import { CommunityThreadPage } from "../../../features/community/thread/community-thread-page.tsx";

export const route = defineFileRoute("/p/:postId", {});

export default function ThreadRoute(props: RouteProps<typeof route>) {
  return <CommunityThreadPage postId={props.params.postId} />;
}

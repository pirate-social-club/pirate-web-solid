import { useNavigate, useSearchParams } from "@solidjs/router";
import type { Component } from "solid-js";
import { currentCommunityCreationRouteRuntimeProps } from "../../features/community/community-creation-avatar-authoring.ts";
import {
  CommunityCreationRouteView,
  type CommunityCreationRouteViewProps,
} from "../../features/community/community-creation-route-view";

export interface CreateCommunityRouteContentProps {
  readonly intentId?: string;
  readonly navigate: NonNullable<CommunityCreationRouteViewProps["navigate"]>;
  readonly View?: Component<CommunityCreationRouteViewProps>;
}

export function CreateCommunityRouteContent(props: CreateCommunityRouteContentProps) {
  const runtime = currentCommunityCreationRouteRuntimeProps();
  const View = props.View ?? CommunityCreationRouteView;
  return (
    <View
      avatarAuthoring={runtime.avatarAuthoring}
      intentId={props.intentId}
      navigate={props.navigate}
    />
  );
}

export default function CreateCommunityRoute() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const intentId = () => typeof search.intent_id === "string" ? search.intent_id : undefined;
  return (
    <CreateCommunityRouteContent
      intentId={intentId()}
      navigate={(href, options) => navigate(href, options)}
    />
  );
}

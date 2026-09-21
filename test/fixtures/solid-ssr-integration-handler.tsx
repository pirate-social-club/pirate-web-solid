import { createRequestEvent, createSSRResponse } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { render } from "../../src/entry-server.tsx";
import {
  CreateCommunityRouteContent,
} from "../../src/routes/communities/new.tsx";
import type { CommunityCreationRouteViewProps } from "../../src/features/community/community-creation-route-view.tsx";

function RoutePropProbe(props: CommunityCreationRouteViewProps) {
  return (
    <main
      data-community-creation-route-avatar-authoring={
        props.avatarAuthoring === true ? "enabled" : "disabled"
      }
    />
  );
}

function CommunityCreationApplicationProbe() {
  return (
    <CreateCommunityRouteContent
      navigate={() => undefined}
      View={RoutePropProbe}
    />
  );
}

export async function handleRequest(
  request: Request,
  options?: Readonly<{
    readonly context?: Readonly<{
      readonly API_NEXT_ORIGIN?: string;
      readonly PUBLIC_APP_CANONICAL_ORIGIN?: string;
      readonly COMMUNITY_CREATION_AVATAR_AUTHORING_ENABLED?: string;
    }>;
  }>,
): Promise<Response> {
  const event = createRequestEvent(request);
  return provideRequestEvent(event, async () => {
    const stream = await render(
      request,
      options?.context,
      { Application: CommunityCreationApplicationProbe },
    );
    return createSSRResponse(stream, event);
  });
}

import { defineFileRoute } from "@solidjs/router/fs";
import { getRequestEvent, httpHeader } from "@solidjs/web";
import { SpacesMemberRequests } from "../features/communities/handle-storefront/spaces-member-requests.tsx";

export const route = defineFileRoute("/spaces-name-requests", {
  preload: () => {
    if (getRequestEvent() !== undefined) httpHeader("Cache-Control", "private, no-store");
    return null;
  },
});

export default function SpacesNameRequestsRoute() { return <SpacesMemberRequests />; }

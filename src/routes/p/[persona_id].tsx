import { query, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";
import { createPublicHandleSalesClient } from "../../api/handle-sales-client.ts";
import {
  loadPersonaPublicProfile,
  type PersonaPublicProfileState,
} from "../../features/profiles/persona-public-profile/persona-public-profile.model.ts";
import PersonaPublicProfile from "../../features/profiles/persona-public-profile/persona-public-profile.tsx";
import {
  decodePersonaRouteParam,
  personaPublicProfileResponsePolicy,
  type PersonaPublicProfilePreflight,
} from "../../features/profiles/persona-public-profile/persona-public-profile-preflight.ts";

function requestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

function commit(state: PersonaPublicProfileState): void {
  const event = getRequestEvent();
  if (event === undefined) return;
  const policy = personaPublicProfileResponsePolicy(state);
  httpStatus(policy.status, policy.statusText);
  policy.headers.forEach((value, name) => httpHeader(name, value));
}

const queryPersonaProfile = query(async (personaId: string) => {
  const state = await loadPersonaPublicProfile(
    createPublicHandleSalesClient({ origin: requestOrigin() }),
    personaId,
  );
  commit(state);
  return state;
}, "persona-public-profile");

export const route = defineFileRoute("/p/:persona_id", {
  preload: ({ params }) => {
    const decoded = decodePersonaRouteParam(params.persona_id) ?? "";
    // SAFETY: entry-server is the sole writer for this request-local key and
    // stores only a validated PersonaPublicProfilePreflight.
    const settled = getRequestEvent()?.locals.personaPublicProfilePreflight as
      | PersonaPublicProfilePreflight
      | undefined;
    if (settled?.personaId === decoded) return settled.state;
    return queryPersonaProfile(decoded);
  },
});

export default function PersonaPublicProfileRoute(props: RouteProps<typeof route>) {
  return <PersonaPublicProfile state={props.data} />;
}

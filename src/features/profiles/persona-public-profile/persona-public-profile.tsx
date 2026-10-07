import { LoadingIndicator } from "../../../design-system";
import { ProfileActivity, type ProfileActivityDependencies } from "../profile-page/profile-activity.tsx";
import { ProfileLayout } from "../profile-page/profile-layout.tsx";
import { Link, Meta, Title } from "@solidjs/meta";
import { Loading, Show, createMemo } from "solid-js";
import {
  type PersonaPublicProfileState,
  type PersonaPublicProfileSuccess,
} from "./persona-public-profile.model.ts";

export interface PersonaPublicProfileProps {
  readonly activityDependencies?: ProfileActivityDependencies;
  readonly state: PersonaPublicProfileState | PromiseLike<PersonaPublicProfileState>;
}

function failureCopy(state: PersonaPublicProfileState): string {
  return state.kind === "invalid"
    ? "This profile address is invalid."
    : state.kind === "not-found" ? "This profile is not available."
      : state.kind === "method-not-allowed" ? "This profile is read-only."
        : "The profile could not be loaded.";
}

function Success(props: { readonly state: PersonaPublicProfileSuccess; readonly activityDependencies?: ProfileActivityDependencies }) {
  const persona = () => props.state.response.persona;
  const name = () => persona().display_name?.trim() || persona().primary_public_handle || "Pirate persona";
  const description = () => props.state.response.profile.bio?.trim() || `${name()} on Pirate`;
  const handle = () => persona().primary_public_handle?.trim();
  return (
    <main class="mx-auto w-full max-w-[65.5rem] pb-24 md:pb-12" data-persona-profile-state="success" data-persona-id={persona().persona_id}>
      <Title>{name()}</Title>
      <Meta name="description" content={description()} />
      <Meta property="og:title" content={name()} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={props.state.canonicalUrl} />
      <Link rel="canonical" href={props.state.canonicalUrl} />
      <ProfileLayout name={name()} handle={handle()} personaId={persona().persona_id}
        avatarRef={persona().avatar_ref} coverRef={props.state.response.profile.cover_ref}
        servingOrigin={props.state.servingOrigin} bio={props.state.response.profile.bio}
        names={props.state.response.handle_grants.map(grant => grant.display_identifier)}><ProfileActivity personaId={persona().persona_id} dependencies={props.activityDependencies} /></ProfileLayout>
    </main>
  );
}

function PersonaState(props: { readonly state: PersonaPublicProfileState; readonly activityDependencies?: ProfileActivityDependencies }) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  return (
    <Show
      when={success()}
      fallback={(
        <main class="mx-auto w-full max-w-5xl px-4 py-8 md:px-8" data-persona-profile-state={props.state.kind}>
          <Title>Profile unavailable</Title>
          <h1>Profile unavailable</h1>
          <p role="alert">{failureCopy(props.state)}</p>
        </main>
      )}
    >
      {state => <Success state={state()} activityDependencies={props.activityDependencies} />}
    </Show>
  );
}

function PersonaData(props: PersonaPublicProfileProps) {
  const state = createMemo(() => props.state, { deferStream: true });
  return <PersonaState state={state()} activityDependencies={props.activityDependencies} />;
}

export function PersonaPublicProfile(props: PersonaPublicProfileProps) {
  return (
    <Loading fallback={<main><LoadingIndicator label="Loading profile" variant="page" /></main>}>
      <PersonaData {...props} />
    </Loading>
  );
}

export default PersonaPublicProfile;

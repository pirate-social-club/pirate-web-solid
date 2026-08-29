import { Link, Meta, Title } from "@solidjs/meta";
import { For, Loading, Show, createMemo } from "solid-js";
import {
  CANONICAL_PUBLIC_ORIGIN,
  type PersonaPublicProfileState,
  type PersonaPublicProfileSuccess,
} from "./persona-public-profile.model.ts";

export interface PersonaPublicProfileProps {
  readonly state: PersonaPublicProfileState | PromiseLike<PersonaPublicProfileState>;
}

function failureCopy(state: PersonaPublicProfileState): string {
  return state.kind === "invalid"
    ? "This profile address is invalid."
    : state.kind === "not-found" ? "This profile is not available."
      : state.kind === "method-not-allowed" ? "This profile is read-only."
        : "The profile could not be loaded.";
}

function canonicalMediaUrl(reference: string): string | undefined {
  try {
    const resolved = new URL(reference, CANONICAL_PUBLIC_ORIGIN);
    return resolved.origin === CANONICAL_PUBLIC_ORIGIN ? resolved.toString() : undefined;
  } catch {
    return undefined;
  }
}

function Success(props: { readonly state: PersonaPublicProfileSuccess }) {
  const persona = () => props.state.response.persona;
  const name = () => persona().display_name?.trim() || persona().primary_public_handle || "Pirate persona";
  const description = () => props.state.response.profile.bio?.trim() || `${name()} on Pirate`;
  const avatar = () => {
    const reference = persona().avatar_ref;
    return reference === null ? undefined : canonicalMediaUrl(reference);
  };
  return (
    <main data-persona-profile-state="success" data-persona-id={persona().persona_id}>
      <Title>{name()}</Title>
      <Meta name="description" content={description()} />
      <Meta property="og:title" content={name()} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={props.state.canonicalUrl} />
      <Link rel="canonical" href={props.state.canonicalUrl} />
      <Show when={avatar()}>
        {source => <img src={source()} alt="" />}
      </Show>
      <h1>{name()}</h1>
      <Show when={props.state.response.profile.bio}>
        {bio => <p>{bio()}</p>}
      </Show>
      <Show when={props.state.response.handle_grants.length > 0}>
        <ul aria-label="Names">
          <For each={props.state.response.handle_grants}>
            {grant => <li>{grant.display_identifier}</li>}
          </For>
        </ul>
      </Show>
      <a href={CANONICAL_PUBLIC_ORIGIN}>Pirate</a>
    </main>
  );
}

function PersonaState(props: { readonly state: PersonaPublicProfileState }) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  return (
    <Show
      when={success()}
      fallback={(
        <main data-persona-profile-state={props.state.kind}>
          <Title>Profile unavailable</Title>
          <h1>Profile unavailable</h1>
          <p role="alert">{failureCopy(props.state)}</p>
        </main>
      )}
    >
      {state => <Success state={state()} />}
    </Show>
  );
}

function PersonaData(props: PersonaPublicProfileProps) {
  const state = createMemo(() => props.state, { deferStream: true });
  return <PersonaState state={state()} />;
}

export function PersonaPublicProfile(props: PersonaPublicProfileProps) {
  return (
    <Loading fallback={<main aria-busy="true"><h1>Loading profile</h1></main>}>
      <PersonaData {...props} />
    </Loading>
  );
}

export default PersonaPublicProfile;

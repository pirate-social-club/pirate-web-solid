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
  const handle = () => persona().primary_public_handle?.trim();
  const avatar = () => {
    const reference = persona().avatar_ref;
    return reference === null ? undefined : canonicalMediaUrl(reference);
  };
  const cover = () => {
    const reference = props.state.response.profile.cover_ref;
    return reference === null ? undefined : canonicalMediaUrl(reference);
  };
  return (
    <main class="mx-auto w-full max-w-4xl pb-24 md:pb-12" data-persona-profile-state="success" data-persona-id={persona().persona_id}>
      <Title>{name()}</Title>
      <Meta name="description" content={description()} />
      <Meta property="og:title" content={name()} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={props.state.canonicalUrl} />
      <Link rel="canonical" href={props.state.canonicalUrl} />
      <div class="h-36 w-full overflow-hidden bg-gradient-to-br from-primary/30 via-secondary to-background md:h-52">
        <Show when={cover()}>{source => <img src={source()} alt="" class="size-full object-cover" />}</Show>
      </div>
      <div class="px-4 md:px-8">
        <div class="-mt-10 flex size-20 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted text-2xl font-semibold md:-mt-12 md:size-24">
          <Show when={avatar()} fallback={<span aria-hidden="true">{name().slice(0, 1).toUpperCase()}</span>}>
            {source => <img src={source()} alt="" class="size-full object-cover" />}
          </Show>
        </div>
        <div class="mt-4 min-w-0">
          <h1 class="break-words text-2xl font-bold tracking-tight md:text-3xl">{name()}</h1>
          <Show when={handle() !== name() ? handle() : undefined}>{value => <p class="mt-1 break-all text-sm text-muted-foreground">@{value()}</p>}</Show>
          <Show when={props.state.response.profile.bio}>
            {bio => <p class="mt-5 max-w-2xl whitespace-pre-wrap break-words leading-relaxed">{bio()}</p>}
          </Show>
        </div>
        <Show when={props.state.response.handle_grants.length > 0}>
          <section class="mt-8 border-t border-border-soft pt-6" aria-labelledby="profile-names-heading">
            <h2 id="profile-names-heading" class="mb-3 text-sm font-semibold">Names</h2>
            <ul aria-label="Names" class="flex flex-wrap gap-2">
              <For each={props.state.response.handle_grants}>
                {grant => <li class="max-w-full break-all rounded-full border border-border-soft px-3 py-1 text-sm">{grant.display_identifier}</li>}
              </For>
            </ul>
          </section>
        </Show>
      </div>
    </main>
  );
}

function PersonaState(props: { readonly state: PersonaPublicProfileState }) {
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
    <Loading fallback={<main aria-busy="true" class="mx-auto w-full max-w-5xl px-4 py-8 md:px-8"><h1>Loading profile</h1></main>}>
      <PersonaData {...props} />
    </Loading>
  );
}

export default PersonaPublicProfile;

import { For, Show } from "solid-js";
import { getRequestEvent, type JSX } from "@solidjs/web";
import { Type } from "../../../design-system.ts";
import { OwnProfileSettings } from "../own-profile-settings.tsx";

export interface ProfileLayoutProps {
  readonly name: string;
  readonly handle?: string | null;
  readonly personaId?: string;
  readonly avatarRef?: string | null;
  readonly coverRef?: string | null;
  readonly servingOrigin?: string;
  readonly bio?: string | null;
  readonly communities?: readonly { readonly name: string; readonly href?: string }[];
  readonly communityHeading?: string;
  readonly names?: readonly string[];
  readonly children?: JSX.Element;
}

/** Profile media stays on the serving host, including cached public SSR. */
export function profileMediaUrl(reference: string | null | undefined, servingOrigin: string | undefined): string | undefined {
  if (!reference || !servingOrigin) return undefined;
  try {
    const origin = new URL(servingOrigin);
    const resolved = new URL(reference, origin);
    return (origin.protocol === "https:" || origin.protocol === "http:") && resolved.origin === origin.origin
      ? resolved.toString() : undefined;
  } catch { return undefined; }
}

/** Shared public identity hero and responsive supporting details for both routes. */
export function ProfileLayout(props: ProfileLayoutProps) {
  const servingOrigin = () => {
    if (props.servingOrigin) return props.servingOrigin;
    const event = getRequestEvent();
    return event ? new URL(event.request.url).origin : typeof location === "undefined" ? undefined : location.origin;
  };
  const avatar = () => profileMediaUrl(props.avatarRef, servingOrigin());
  const cover = () => profileMediaUrl(props.coverRef, servingOrigin());
  return <section class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-5 px-3 py-3 md:px-6 md:py-6" data-profile-layout>
    <section aria-label="Profile" class="overflow-hidden md:rounded-3xl md:border md:border-border-soft md:bg-card">
      <div class="relative h-36 overflow-hidden bg-muted md:h-48" data-profile-cover>
        <Show when={cover()}>{source => <img src={source()} alt="" class="size-full object-cover" />}</Show>
      </div>
      <div class="relative flex flex-col gap-4 pb-4 md:px-6 md:pb-6">
        <div class="relative -mt-10 grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-background bg-muted md:-mt-12 md:size-24">
          <Show when={avatar()} fallback={<Type variant="h2" aria-hidden="true">{props.name.slice(0, 1).toUpperCase()}</Type>}>{source => <img src={source()} alt="" class="size-full object-cover" />}</Show>
        </div>
        <div class="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0 flex-1">
            <Type as="h1" variant="h2" class="break-words">{props.name}</Type>
            <Show when={props.handle && props.handle !== props.name ? props.handle : undefined}>{handle => <Type as="p" variant="caption" class="mt-1 break-all" data-profile-handle={handle()}>@{handle()}</Type>}</Show>
            <Show when={props.bio}>{bio => <Type as="p" variant="body" class="mt-3 whitespace-pre-wrap break-words">{bio()}</Type>}</Show>
          </div>
          <div class="flex w-full shrink-0 empty:hidden md:w-auto"><OwnProfileSettings personaId={props.personaId} handle={props.handle ?? undefined} /></div>
        </div>
      </div>
    </section>
    <Show when={props.communities?.length}><section aria-labelledby="created-communities-heading" class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <Type as="h2" variant="label" id="created-communities-heading">{props.communityHeading ?? "Created communities"}</Type>
      <ul class="flex min-w-0 flex-wrap gap-x-4 gap-y-2"><For each={props.communities}>{community => <li><Show when={community.href} fallback={<Type variant="body">{community.name}</Type>}>{href => <a class="break-words hover:underline" href={href()}><Type variant="body">{community.name}</Type></a>}</Show></li>}</For></ul>
    </section></Show>
    <Show when={props.names?.length}><section aria-labelledby="profile-names-heading" class="flex min-w-0 flex-wrap items-center gap-3"><Type as="h2" variant="label" id="profile-names-heading">Names</Type><ul aria-label="Names" class="flex flex-wrap gap-3"><For each={props.names}>{name => <li><Type variant="caption" class="break-all">{name}</Type></li>}</For></ul></section></Show>
    {props.children}
  </section>;
}

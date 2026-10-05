import { For, Show } from "solid-js";
import { getRequestEvent, type JSX } from "@solidjs/web";
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
  readonly hasActivity?: boolean;
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
  return <section class="mx-auto flex w-full min-w-0 max-w-[65.5rem] flex-col gap-5 px-3 py-3 md:px-6 md:py-6" data-profile-layout>
    <section aria-label="Profile" class="overflow-hidden md:rounded-3xl md:border md:border-border-soft md:bg-card">
      <div class="relative h-36 overflow-hidden bg-muted md:h-60">
        <Show when={cover()}>{source => <img src={source()} alt="" class="size-full object-cover" />}</Show>
      </div>
      <div class="relative flex flex-col gap-4 pb-4 md:px-6 md:pb-6">
        <div class="-mt-10 flex flex-col gap-4 md:-mt-12 md:flex-row md:items-end md:justify-between">
          <div class="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:gap-5">
            <div class="relative z-10 grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-background bg-muted text-2xl font-semibold md:size-24">
              <Show when={avatar()} fallback={<span aria-hidden="true">{props.name.slice(0, 1).toUpperCase()}</span>}>{source => <img src={source()} alt="" class="size-full object-cover" />}</Show>
            </div>
            <div class="min-w-0 md:pb-1">
              <h1 class="break-words text-2xl font-bold tracking-tight md:text-3xl">{props.name}</h1>
              <Show when={props.handle && props.handle !== props.name ? props.handle : undefined}>{handle => <p class="mt-1 break-all text-sm text-muted-foreground" data-profile-handle={handle()}>@{handle()}</p>}</Show>
            </div>
          </div>
          <div class="flex w-full shrink-0 empty:hidden md:w-auto md:justify-end"><OwnProfileSettings personaId={props.personaId} handle={props.handle ?? undefined} /></div>
        </div>
      </div>
    </section>
    <div class={props.hasActivity ? "grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]" : "min-w-0"}>
      <Show when={props.bio || props.communities?.length || props.names?.length}><aside aria-label="Profile details" class={props.hasActivity ? "order-first flex min-w-0 flex-col gap-4 xl:order-last xl:col-start-2 xl:row-start-1" : "flex min-w-0 flex-col gap-4"}>
        <Show when={props.bio}>{bio => <div class="rounded-xl border border-border-soft bg-card p-5"><p class="whitespace-pre-wrap break-words leading-relaxed">{bio()}</p></div>}</Show>
        <Show when={props.communities?.length}><section class="rounded-xl border border-border-soft bg-card p-5" aria-labelledby="created-communities-heading">
          <h2 id="created-communities-heading" class="mb-3 text-sm font-semibold">{props.communityHeading ?? "Created communities"}</h2>
          <ul class="flex flex-col gap-3"><For each={props.communities}>{community => <li><Show when={community.href} fallback={<span>{community.name}</span>}>{href => <a class="break-words hover:underline" href={href()}>{community.name}</a>}</Show></li>}</For></ul>
        </section></Show>
        <Show when={props.names?.length}><section class="rounded-xl border border-border-soft bg-card p-5" aria-labelledby="profile-names-heading"><h2 id="profile-names-heading" class="mb-3 text-sm font-semibold">Names</h2><ul aria-label="Names" class="space-y-2"><For each={props.names}>{name => <li class="break-all text-sm">{name}</li>}</For></ul></section></Show>
      </aside></Show>
      <Show when={props.hasActivity}><div class="min-w-0 xl:col-start-1 xl:row-start-1">{props.children}</div></Show>
    </div>
  </section>;
}

/** @jsxImportSource @solidjs/web */
import { For, Show, createMemo, createSignal } from "solid-js";

import {
  Avatar,
  Button,
  Card,
  CardContent,
  CommunityAvatar,
  IconCalendar,
  IconCaretDown,
  IconCheckCircle,
  IconGlobe,
  IconMaskHappy,
  IconShield,
  IconWallet,
  ResponsiveOptionSelect,
  Separator,
  Type,
  type ResponsiveOptionSelectOption,
} from "@pirate/web-solid-ui";
import { CommunityPostCard } from "./community-post-card";
import {
  orderedCommunityRules,
  orderedReferenceLinks,
  safeCommunityHref,
  sortCommunityPosts,
  type CommunityGate,
  type CommunityData,
  type CommunitySort,
} from "./page-shell-model";

export interface CommunityPageShellProps {
  community: CommunityData;
  empty?: boolean;
  mobile?: boolean;
  following: boolean;
  joined: boolean;
  canJoin?: boolean;
  showCreatePost?: boolean;
  onFollowToggle?: () => void;
  onJoin?: () => void;
  onCreatePost?: () => void;
  onPostOpen?: (postId: string) => void;
  onPostShare?: (postId: string) => void;
  onPostVote?: (postId: string, direction: "up" | "down") => void;
}

function tabClass(active: boolean): string {
  return active
    ? "cursor-pointer border-b-2 border-primary px-1 py-3 text-foreground"
    : "cursor-pointer border-b-2 border-transparent px-1 py-3 text-muted-foreground hover:text-foreground";
}

function parseCommunitySort(value: string): CommunitySort {
  return value === "new" || value === "top" ? value : "best";
}

const communitySortOptions: readonly ResponsiveOptionSelectOption[] = [
  { label: "Best", value: "best" },
  { label: "New", value: "new" },
  { label: "Top", value: "top" },
];

export function CommunityPageShell(props: CommunityPageShellProps) {
  const [sort, setSort] = createSignal<CommunitySort>("best");
  const [tab, setTab] = createSignal<"feed" | "about">("feed");
  const community = () => props.community;
  const sortedPosts = createMemo(() => sortCommunityPosts(community().posts, sort()));
  const expandedGates = createMemo(() => (community().gates ?? []).flatMap(expandGate));
  const hasPosts = () => !props.empty && sortedPosts().length > 0;

  return (
    <section
      class={props.mobile ? "w-full bg-background" : "mx-auto w-full max-w-6xl bg-background"}
      data-community-page
    >
      <header class="overflow-hidden rounded-[var(--radius-3xl)] border border-border-soft bg-card shadow-[var(--shadow-md)]">
        <div class="relative h-48 overflow-hidden bg-gradient-to-br from-teal-900 via-slate-800 to-indigo-950 md:h-72">
          <Show
            when={community().bannerSrc}
            fallback={<div class="absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(255,255,255,0.16),transparent_24%),linear-gradient(165deg,rgba(31,111,73,0.95),rgba(11,55,73,0.96)_55%,rgba(29,31,63,0.98))]" />}
          >
            {(bannerSrc) => <img alt={`${community().name} banner`} class="h-full w-full object-cover" src={bannerSrc()} />}
          </Show>
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/45" />
        </div>

        <div class="relative px-5 pb-5 md:px-8 md:pb-7">
          <div class="-mt-12 flex flex-col gap-4 md:-mt-16 md:flex-row md:items-end md:justify-between md:gap-6">
            <div class="flex min-w-0 items-end gap-4">
              <div class="size-24 shrink-0 overflow-hidden rounded-full border-4 border-card bg-card shadow-lg md:size-28">
                <CommunityAvatar
                  avatarSrc={community().avatarSrc}
                  class="size-full"
                  communityId={community().handle}
                  displayName={community().name}
                  size="lg"
                />
              </div>
              <div class="min-w-0 pb-1">
                <Type as="h1" variant="h1" class="truncate">{community().name}</Type>
                <Type variant="caption">{community().handle}</Type>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3" aria-label="Community actions">
              <div class="flex w-full max-w-xs gap-3 md:w-auto">
                <Button class="w-32" onClick={() => props.onFollowToggle?.()} variant={props.following ? "secondary" : "default"}>
                  {props.following ? "Following" : "Follow"}
                </Button>
                <Show when={props.canJoin !== false}>
                  <Button class="w-32" disabled={props.joined} onClick={() => props.onJoin?.()} variant="secondary">
                    {props.joined ? "Joined" : "Join"}
                  </Button>
                </Show>
              </div>
              <Show when={props.joined || props.showCreatePost}>
                <Button onClick={() => props.onCreatePost?.()} variant="secondary">Create Post</Button>
              </Show>
            </div>
          </div>
        </div>
      </header>

      <div class="mt-4 flex items-center gap-6 border-b border-border-soft px-1 md:hidden">
        <button class={tab() === "feed" ? tabClass(true) : tabClass(false)} onClick={() => setTab("feed")} type="button">Feed</button>
        <button class={tab() === "about" ? tabClass(true) : tabClass(false)} onClick={() => setTab("about")} type="button">About</button>
      </div>

      <div class="grid gap-6 py-4 md:grid-cols-[minmax(0,1fr)_18rem] md:py-6">
        <main class={tab() === "about" ? "hidden md:block" : "min-w-0"} aria-label="Community posts">
          <div class="mb-3 flex justify-end px-1">
            <div class="flex items-center gap-2">
              <Type as="span" variant="label">Sort</Type>
              <ResponsiveOptionSelect
                ariaLabel="Sort community feed"
                class="w-auto"
                drawerTitle="Sort community feed"
                onValueChange={(value) => setSort(parseCommunitySort(value))}
                options={communitySortOptions}
                selectAlign="end"
                triggerClass="min-w-28"
                value={sort()}
              />
            </div>
          </div>
          <Show
            when={hasPosts()}
            fallback={<Card><CardContent class="p-6"><Type variant="body">No posts in this community yet.</Type></CardContent></Card>}
          >
            <div class="overflow-hidden rounded-[var(--radius-lg)] border border-border-soft bg-background">
              <For each={sortedPosts()}>
                {(post) => (
                  <CommunityPostCard
                    onOpen={props.onPostOpen}
                    onShare={props.onPostShare}
                    onVote={props.onPostVote}
                    post={post}
                  />
                )}
              </For>
            </div>
          </Show>
        </main>

        <aside class={tab() === "about" ? "flex min-w-0 flex-col gap-4" : "hidden min-w-0 flex-col gap-4 md:flex"} aria-label="Community information">
          <Card>
            <CardContent class="flex flex-col gap-5 p-5">
              <div class="flex items-center gap-3">
                <CommunityAvatar
                  avatarSrc={community().avatarSrc}
                  communityId={community().handle}
                  displayName={community().name}
                  size="md"
                />
                <div class="min-w-0">
                  <Type as="h3" variant="h3" class="truncate">{community().name}</Type>
                  <Type variant="caption">{community().handle}</Type>
                </div>
              </div>

              <Type as="p" variant="body" class="text-muted-foreground">{community().description}</Type>

              <div class="grid grid-cols-2 gap-4">
                <div><Type as="div" variant="h3">{community().followers.toLocaleString("en-US")}</Type><Type variant="caption">Followers</Type></div>
                <div><Type as="div" variant="h3">{community().members.toLocaleString("en-US")}</Type><Type variant="caption">Citizens</Type></div>
              </div>

              <Show when={community().owner}>
                {(owner) => <div class="flex flex-col gap-2"><Type variant="label">Owner</Type><div class="flex items-center gap-3"><AvatarHolder holder={owner()} /></div></div>}
              </Show>

              <Show when={expandedGates().length > 0}>
                <details class="border-t border-border-soft pt-4" open>
                  <summary class="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <Type variant="label">Gates</Type>
                    <IconCaretDown aria-hidden="true" class="size-4 text-muted-foreground" />
                  </summary>
                  <div class="mt-3 flex flex-col gap-3">
                    <Type as="p" variant="caption">
                      {gateJoinCopy(community().gateMode ?? "unknown", expandedGates().length)}
                    </Type>
                    <ul class="flex flex-col">
                      <For each={expandedGates()}>
                        {(gate, index) => (
                          <li class="flex min-h-11 items-center gap-3 border-b border-border-soft/70 py-2.5 last:border-b-0">
                            <div class="grid size-9 shrink-0 place-items-center"><GateIcon gateType={gate.gateType} provider={gate.provider} /></div>
                            <div class="min-w-0 flex-1 [overflow-wrap:anywhere]">
                              <Type as="span" class="block" variant="body-strong">{gate.label}</Type>
                              <Show when={gate.detail}><Type as="span" class="block text-muted-foreground" variant="caption">{gate.detail}</Type></Show>
                            </div>
                            <div class="grid size-6 shrink-0 place-items-center">
                              <Show when={community().gateMode === "any" && index() < expandedGates().length - 1} fallback={<GateStatusMark status={gate.status} />}>
                                <Type as="span" class="text-muted-foreground/60" variant="caption">OR</Type>
                              </Show>
                            </div>
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                </details>
              </Show>

              <Show when={community().rules?.length}>
                <Separator />
                <details class="flex flex-col gap-3" open>
                  <summary class="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <Type variant="label">Community rules</Type>
                    <IconCaretDown aria-hidden="true" class="size-4 text-muted-foreground" />
                  </summary>
                  <ol class="flex flex-col gap-3 pt-2"><For each={orderedCommunityRules(community().rules ?? [])}>{(rule, index) => <li class="flex gap-3"><Type as="span" class="shrink-0 tabular-nums text-muted-foreground/60" variant="body">{index() + 1}</Type><div><Type as="div" variant="body-strong">{rule.title}</Type><Type variant="caption">{rule.body}</Type></div></li>}</For></ol>
                </details>
              </Show>

              <Show when={community().referenceLinks?.length}>
                <Separator />
                <nav aria-label="Community reference links"><Type variant="label">Links</Type><ul class="mt-2 flex flex-col gap-2"><For each={orderedReferenceLinks(community().referenceLinks ?? [])}>{(link) => <Show when={safeCommunityHref(link.href)}>{(href) => <li><a aria-label={`Open ${link.label}`} class="text-foreground underline underline-offset-4" href={href()} rel="noreferrer" target="_blank">{link.label}</a></li>}</Show>}</For></ul></nav>
              </Show>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function AvatarHolder(props: { holder: { displayName: string; handle: string; avatarSrc?: string } }) {
  return (
    <>
      <Avatar
        fallback={props.holder.displayName}
        size="sm"
        src={props.holder.avatarSrc}
      />
      <Type as="div" variant="label" class="truncate">{pirateHandle(props.holder.handle)}</Type>
    </>
  );
}

interface ExpandedGate {
  label: string;
  provider?: string;
  detail?: string;
  gateType?: string;
  status: "met" | "unmet" | "unknown";
}

function expandGate(gate: CommunityGate): ExpandedGate[] {
  const providers = gate.acceptedProviders ?? [];
  if (providers.length === 0) return [{ label: gate.label, detail: gate.detail, gateType: gate.gateType, status: gate.status }];
  return providers.map((provider) => ({
    label: providerLabel(provider),
    provider,
    gateType: gate.gateType,
    status: gate.status,
  }));
}

function providerLabel(provider: string): string {
  switch (provider) {
    case "self": return "Self.xyz ID proof";
    case "zkpassport": return "ZKPassport proof";
    case "very": return "Palm scan";
    case "passport": return "Human Passport proof";
    default: return provider;
  }
}

function gateJoinCopy(mode: "all" | "any" | "unknown", count: number): string {
  if (mode === "any") return "To join this community, one of the following is required:";
  if (mode === "all") return "To join this community, all of the following are required:";
  return count === 1 ? "To join this community, the following is required:" : "To join this community, the following are required:";
}

function GateIcon(props: { gateType?: string; provider?: string }) {
  if (props.gateType === "age_over_18" || props.gateType === "minimum_age") return <IconCalendar aria-hidden="true" class="size-5 text-muted-foreground" />;
  if (props.gateType === "nationality") return <IconGlobe aria-hidden="true" class="size-5 text-muted-foreground" />;
  if (props.gateType === "wallet_score" || props.gateType === "asset_balance" || props.gateType === "erc721_holding" || props.gateType === "erc721_inventory_match") return <IconWallet aria-hidden="true" class="size-5 text-muted-foreground" />;
  if (props.gateType === "unique_human") return <IconMaskHappy aria-hidden="true" class="size-5 text-muted-foreground" />;
  return props.provider === "self" || props.provider === "zkpassport" ? <IconShield aria-hidden="true" class="size-5 text-muted-foreground" /> : <IconShield aria-hidden="true" class="size-5 text-muted-foreground" />;
}

function GateStatusMark(props: { status: "met" | "unmet" | "unknown" }) {
  return props.status === "met"
    ? <IconCheckCircle aria-label="Requirement met" class="size-5 text-success" />
    : <span aria-label={props.status === "unmet" ? "Requirement needs action" : "Requirement status unknown"} class="size-5 rounded-full border border-muted-foreground/60" />;
}

function pirateHandle(handle: string): string {
  const normalized = handle.trim().replace(/^u\//i, "").replace(/^@/, "");
  if (!normalized) return "pirate";
  return normalized.includes(".") ? normalized : `${normalized}.pirate`;
}

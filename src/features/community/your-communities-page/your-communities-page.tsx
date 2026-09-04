import { For, Show, createSignal } from "solid-js";

import {
  Button,
  CommunityAvatar,
  PageContainer,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Type,
} from "@pirate/web-solid-ui";
import { formatCommunityRouteLabel, type YourCommunitySummary } from "./your-communities-page-model";

export type { YourCommunitySummary } from "./your-communities-page-model";

export interface YourCommunitiesPageProps {
  createCommunityLabel: string;
  emptyFollowingLabel: string;
  emptyJoinedLabel: string;
  followingCommunities: YourCommunitySummary[];
  followingLabel: string;
  joinedCommunities: YourCommunitySummary[];
  joinedLabel: string;
  onCreateCommunity: () => void;
  onPostHere?: (community: YourCommunitySummary) => void;
  onSelectCommunity: (community: YourCommunitySummary) => void;
  title: string;
}

type YourCommunitiesTab = "following" | "joined";

function YourCommunityListItem(props: {
  community: YourCommunitySummary;
  onPostHere?: (community: YourCommunitySummary) => void;
  onSelectCommunity: (community: YourCommunitySummary) => void;
}) {
  const community = () => props.community;
  const routeLabel = () => formatCommunityRouteLabel(community().communityId, community().routeSlug);
  const content = () => <>
    <CommunityAvatar class="size-11 border-border-soft" avatarSrc={community().avatarSrc} communityId={community().communityId} displayName={community().displayName} />
    <div class="min-w-0 flex-1">
      <Type as="div" variant="body-strong" class="truncate">{community().displayName}</Type>
      <Type as="div" variant="caption" class="truncate">{routeLabel()}</Type>
    </div>
  </>;
  return (
    <div
      class="flex w-full items-center gap-3 border-b border-border-soft px-1 py-4 last:border-b-0 md:px-0"
      data-community-id={community().communityId}
      id={`community-${community().communityId}`}
    >
      <Show when={community().resourceHref} fallback={<div class="flex min-w-0 flex-1 items-center gap-3">{content()}</div>}>
        <button class="flex min-w-0 flex-1 items-center gap-3 text-start transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => props.onSelectCommunity(community())} type="button">
          {content()}
        </button>
      </Show>
      <Show when={props.onPostHere}>
        <Button data-post-community-id={community().communityId} onClick={() => props.onPostHere?.(community())} size="sm" variant="secondary">Post here</Button>
      </Show>
    </div>
  );
}

function YourCommunitySection(props: {
  communities: YourCommunitySummary[];
  emptyLabel: string;
  onPostHere?: (community: YourCommunitySummary) => void;
  onSelectCommunity: (community: YourCommunitySummary) => void;
  title: string;
}) {
  const communities = () => props.communities;
  return (
    <section class="min-w-0">
      <div class="mb-3 flex items-center justify-between gap-4">
        <Type as="h2" variant="h3" class="hidden md:block">{props.title}</Type>
      </div>
      <Show when={communities().length > 0} fallback={<Type as="p" variant="caption" class="py-4">{props.emptyLabel}</Type>}>
        <div>
          <For each={communities()}>
            {(community) => <YourCommunityListItem community={community} onPostHere={props.onPostHere} onSelectCommunity={props.onSelectCommunity} />}
          </For>
        </div>
      </Show>
    </section>
  );
}

export function YourCommunitiesPageView(props: YourCommunitiesPageProps) {
  const [activeTab, setActiveTab] = createSignal<YourCommunitiesTab>("joined");
  const selectTab = (value: string) => setActiveTab(value === "joined" ? "joined" : "following");

  return (
    <PageContainer class="flex min-w-0 flex-1 flex-col gap-6">
      <div class="hidden flex-col gap-4 md:flex md:flex-row md:items-center md:justify-between">
        <Type as="h1" variant="h1">{props.title}</Type>
        <div class="flex shrink-0 flex-wrap gap-3">
          <Button onClick={props.onCreateCommunity} variant="secondary">{props.createCommunityLabel}</Button>
        </div>
      </div>

      <div class="md:hidden">
        <Tabs class="flex flex-col gap-4" onChange={selectTab} value={activeTab()}>
          <TabsList columns={2} variant="underline">
            <TabsTrigger value="following" variant="underline">{props.followingLabel}</TabsTrigger>
            <TabsTrigger value="joined" variant="underline">{props.joinedLabel}</TabsTrigger>
          </TabsList>
          <TabsContent class="mt-0" value="following">
            <YourCommunitySection communities={props.followingCommunities} emptyLabel={props.emptyFollowingLabel} onSelectCommunity={props.onSelectCommunity} title={props.followingLabel} />
          </TabsContent>
          <TabsContent class="mt-0" value="joined">
            <YourCommunitySection communities={props.joinedCommunities} emptyLabel={props.emptyJoinedLabel} onPostHere={props.onPostHere} onSelectCommunity={props.onSelectCommunity} title={props.joinedLabel} />
          </TabsContent>
        </Tabs>
      </div>

      <div class="hidden min-w-0 flex-col gap-8 md:flex">
        <YourCommunitySection communities={props.followingCommunities} emptyLabel={props.emptyFollowingLabel} onSelectCommunity={props.onSelectCommunity} title={props.followingLabel} />
        <div class="h-px bg-border-soft" />
        <YourCommunitySection communities={props.joinedCommunities} emptyLabel={props.emptyJoinedLabel} onPostHere={props.onPostHere} onSelectCommunity={props.onSelectCommunity} title={props.joinedLabel} />
      </div>
    </PageContainer>
  );
}

export const YourCommunitiesPage = YourCommunitiesPageView;

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
  onSelectCommunity: (community: YourCommunitySummary) => void;
  title: string;
}

type YourCommunitiesTab = "following" | "joined";

function YourCommunityListItem(props: {
  community: YourCommunitySummary;
  onSelectCommunity: (community: YourCommunitySummary) => void;
}) {
  const community = () => props.community;
  const routeLabel = () => formatCommunityRouteLabel(community().communityId, community().routeSlug);
  return (
    <button
      class="flex w-full items-center gap-3 border-b border-border-soft px-1 py-4 text-start transition-colors last:border-b-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:px-0 md:hover:bg-transparent"
      data-community-id={community().communityId}
      id={`community-${community().communityId}`}
      onClick={() => props.onSelectCommunity(community())}
      type="button"
    >
      <CommunityAvatar class="size-11 border-border-soft" avatarSrc={community().avatarSrc} communityId={community().communityId} displayName={community().displayName} />
      <div class="min-w-0 flex-1">
        <Type as="div" variant="body-strong" class="truncate">{community().displayName}</Type>
        <Type as="div" variant="caption" class="truncate">{routeLabel()}</Type>
      </div>
    </button>
  );
}

function YourCommunitySection(props: {
  communities: YourCommunitySummary[];
  emptyLabel: string;
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
            {(community) => <YourCommunityListItem community={community} onSelectCommunity={props.onSelectCommunity} />}
          </For>
        </div>
      </Show>
    </section>
  );
}

export function YourCommunitiesPageView(props: YourCommunitiesPageProps) {
  const [activeTab, setActiveTab] = createSignal<YourCommunitiesTab>("following");
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
            <YourCommunitySection communities={props.joinedCommunities} emptyLabel={props.emptyJoinedLabel} onSelectCommunity={props.onSelectCommunity} title={props.joinedLabel} />
          </TabsContent>
        </Tabs>
      </div>

      <div class="hidden min-w-0 flex-col gap-8 md:flex">
        <YourCommunitySection communities={props.followingCommunities} emptyLabel={props.emptyFollowingLabel} onSelectCommunity={props.onSelectCommunity} title={props.followingLabel} />
        <div class="h-px bg-border-soft" />
        <YourCommunitySection communities={props.joinedCommunities} emptyLabel={props.emptyJoinedLabel} onSelectCommunity={props.onSelectCommunity} title={props.joinedLabel} />
      </div>
    </PageContainer>
  );
}

export const YourCommunitiesPage = YourCommunitiesPageView;

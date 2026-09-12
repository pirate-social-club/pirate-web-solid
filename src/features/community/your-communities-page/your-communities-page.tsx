import { For, Show } from "solid-js";

import {
  Button,
  CommunityAvatar,
  PageContainer,
  Type,
} from "@pirate/web-solid-ui";
import { communityRouteLabel, type YourCommunitySummary } from "./your-communities-page-model";

export type { YourCommunitySummary } from "./your-communities-page-model";

export interface YourCommunitiesPageProps {
  createCommunityLabel: string;
  emptyJoinedLabel: string;
  joinedCommunities: YourCommunitySummary[];
  joinedLabel: string;
  onCreateCommunity: () => void;
  onPostHere?: (community: YourCommunitySummary) => void;
  onSelectCommunity: (community: YourCommunitySummary) => void;
  title: string;
}

function YourCommunityListItem(props: {
  community: YourCommunitySummary;
  onPostHere?: (community: YourCommunitySummary) => void;
  onSelectCommunity: (community: YourCommunitySummary) => void;
}) {
  const community = () => props.community;
  // A community without a route shows no caption at all; "no route" is
  // protocol vocabulary and read like a defect on the creator's own community.
  const routeLabel = () => communityRouteLabel(community().routeSlug);
  const content = () => <>
    <CommunityAvatar class="size-11 border-border-soft" avatarSrc={community().avatarSrc} communityId={community().communityId} displayName={community().displayName} />
    <div class="min-w-0 flex-1">
      <Type as="div" variant="body-strong" class="truncate">{community().displayName}</Type>
      <Show when={routeLabel()}>{label => <Type as="div" variant="caption" class="truncate">{label()}</Type>}</Show>
    </div>
  </>;
  return (
    <div
      class="flex w-full items-center gap-3 border-b border-border-soft py-4 last:border-b-0"
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

export function YourCommunitiesPageView(props: YourCommunitiesPageProps) {
  return (
    <PageContainer class="flex min-w-0 flex-1 flex-col gap-6 pt-6 md:pt-10" gutter>
      {/* The title and the Create action are reachable at every width; a
          phone otherwise offers no way to start a community. */}
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Type as="h1" variant="h1">{props.title}</Type>
        <div class="flex shrink-0 flex-wrap gap-3">
          <Button onClick={props.onCreateCommunity} variant="secondary">{props.createCommunityLabel}</Button>
        </div>
      </div>

      <section class="min-w-0" aria-label={props.joinedLabel}>
        <Show when={props.joinedCommunities.length > 0} fallback={<Type as="p" variant="caption" class="py-4">{props.emptyJoinedLabel}</Type>}>
          <div>
            <For each={props.joinedCommunities}>
              {(community) => <YourCommunityListItem community={community} onPostHere={props.onPostHere} onSelectCommunity={props.onSelectCommunity} />}
            </For>
          </div>
        </Show>
      </section>
    </PageContainer>
  );
}

export const YourCommunitiesPage = YourCommunitiesPageView;

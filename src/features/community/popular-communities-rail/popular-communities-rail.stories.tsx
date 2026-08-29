/** @jsxImportSource @solidjs/web */
import { For, Show } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Avatar, Card, CardContent, Type } from "@pirate/web-solid-ui";

interface PopularCommunity { communityId: string; label: string; followers: number; href: string; }
const popularCommunities: readonly PopularCommunity[] = [
  { communityId: "destiny", label: "c/DestinyTheGame", followers: 3_354_929, href: "/c/destiny" },
  { communityId: "anime", label: "c/anime", followers: 14_246_777, href: "/c/anime" },
  { communityId: "destiny2", label: "c/destiny2", followers: 930_309, href: "/c/destiny2" },
  { communityId: "fortnite", label: "c/FortNiteBR", followers: 5_653_387, href: "/c/fortnite" },
  { communityId: "dnd", label: "c/dndnext", followers: 817_992, href: "/c/dndnext" },
];

export function PopularCommunitiesRail(props: { items: readonly PopularCommunity[]; title?: string; showFooter?: boolean }) {
  return <Card class="w-full" data-popular-communities><CardContent class="flex flex-col gap-4 p-4"><Type variant="h3">{props.title ?? "Popular right now"}</Type><nav aria-label={props.title ?? "Popular communities"}><ul class="flex flex-col gap-3"><For each={props.items}>{(item) => <li><a class="flex items-center gap-3 rounded-[var(--radius-md)] p-2 hover:bg-primary-subtle" href={item.href}><Avatar fallback={item.label.slice(2, 4).toUpperCase()} size="sm" /><span class="min-w-0 flex-1"><Type as="span" class="block truncate" variant="body-strong">{item.label}</Type><Type as="span" class="block" variant="caption">{item.followers.toLocaleString("en-US")} followers</Type></span></a></li>}</For></ul></nav><Show when={props.showFooter ?? true}><a class="text-foreground underline underline-offset-4" href="/communities"><Type as="span" variant="label">Browse all communities</Type></a></Show></CardContent></Card>;
}
const meta = { title: "Parts/Community/PopularCommunitiesRail", component: PopularCommunitiesRail, args: { items: popularCommunities }, parameters: { layout: "centered" } } satisfies Meta<typeof PopularCommunitiesRail>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { render: () => <div class="w-80"><PopularCommunitiesRail items={popularCommunities} /></div> };
export const WithoutFooter: Story = { render: () => <div class="w-80"><PopularCommunitiesRail items={popularCommunities.slice(0, 3)} showFooter={false} title="Popular Communities" /></div> };
export const SingleItem: Story = { render: () => <div class="w-80"><PopularCommunitiesRail items={popularCommunities.slice(0, 1)} /></div> };

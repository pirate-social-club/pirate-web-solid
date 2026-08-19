/** @jsxImportSource @solidjs/web */
import { For, Show } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Avatar, Button, Card, CardContent, CommunityAvatar, Separator, Type } from "@pirate/web-solid-ui";
import { emptyGateCopy, formatCommunityCount, gateModeLabel, orderedGates, orderedSidebarReferenceLinks, orderedSidebarRules, safeSidebarHref, type GateMode, type GateStatus, type SidebarGate, type SidebarReferenceLink, type SidebarRule } from "./sidebar-model";

interface Person { displayName: string; handle: string; role: "owner" | "moderator" | "admin"; }
interface CommunitySidebarProps { displayName: string; description: string; followers: number; members: number; gates?: readonly SidebarGate[]; mode?: GateMode; owner?: Person; moderators?: readonly Person[]; store?: string; rules?: readonly SidebarRule[]; referenceLinks?: readonly SidebarReferenceLink[]; hasActionTimeCheck?: boolean; locale?: string; mobile?: boolean; }

function GateStatusMark(props: { status: GateStatus }) { return <Type as="span" variant="caption">{props.status === "met" ? "Met" : props.status === "unmet" ? "Needs action" : "Checking"}</Type>; }

export function CommunitySidebar(props: CommunitySidebarProps) {
  const locale = () => props.locale ?? "en-US";
  const gates = () => orderedGates(props.gates ?? []);
  return <Card class={props.mobile ? "w-full" : "w-full max-w-sm"} data-community-sidebar dir={props.locale === "ar" ? "rtl" : "ltr"}><CardContent class="flex flex-col gap-4 p-5">
    <div class="flex items-center gap-3"><CommunityAvatar communityId={props.displayName} displayName={props.displayName} size="lg" /><div class="min-w-0"><Type variant="h2">{props.displayName}</Type><Type variant="caption">{formatCommunityCount(props.followers, locale())} followers</Type></div></div>
    <Type variant="body">{props.description}</Type><Type variant="caption">{formatCommunityCount(props.members, locale())} members</Type>
    <Show when={props.owner || (props.moderators?.length ?? 0) > 0}><Separator /><Type variant="label">Roles</Type><ul class="flex flex-col gap-2"><Show when={props.owner}><li class="flex items-center gap-2"><Avatar fallback={props.owner?.displayName ?? "Owner"} size="xs" /><Type variant="body-strong">{props.owner?.displayName}</Type><Type variant="caption">owner</Type></li></Show><For each={props.moderators ?? []}>{(person) => <li class="flex items-center gap-2"><Avatar fallback={person.displayName} size="xs" /><Type variant="body">{person.displayName}</Type><Type variant="caption">{person.role}</Type></li>}</For></ul></Show>
    <Show when={props.store}><a class="text-foreground underline underline-offset-4" href="#store" onClick={(event) => event.preventDefault()}><Type variant="label">{props.store}</Type></a></Show>
    <Show when={props.rules?.length}><Separator /><Type variant="label">Community rules</Type><ol class="flex flex-col gap-3"><For each={orderedSidebarRules(props.rules ?? [])}>{(rule) => <li><Type variant="body-strong">{rule.title}</Type><Type variant="caption">{rule.body}</Type></li>}</For></ol></Show>
    <Show when={props.referenceLinks?.length}><Separator /><Type variant="label">Reference links</Type><nav aria-label="Community reference links"><ul class="flex flex-col gap-2"><For each={orderedSidebarReferenceLinks(props.referenceLinks ?? [])}>{(link) => <Show when={safeSidebarHref(link.href)}>{(href) => <li><a aria-label={`Open ${link.label}`} class="text-foreground underline underline-offset-4" href={href()} rel="noreferrer" target="_blank"><Type as="span" variant="body">{link.label}</Type></a></li>}</Show>}</For></ul></nav></Show>
    <Separator /><Type variant="label">{gateModeLabel(props.mode ?? "unknown", gates().length, props.hasActionTimeCheck)}</Type><Show when={props.hasActionTimeCheck}><div data-action-time-check class="rounded-[var(--radius-md)] border border-border-soft p-3"><Type variant="body-strong">Action-time browser check</Type><Type variant="caption">Complete a proof-of-work check when you join.</Type></div></Show><Show when={gates().length > 0} fallback={<Type variant="body">{emptyGateCopy(Boolean(props.hasActionTimeCheck))}</Type>}><ul class="flex flex-col gap-3" aria-label="Community requirements"><For each={gates()}>{(gate) => <li class="flex items-start justify-between gap-3"><div class="min-w-0"><Type variant="body">{gate.label}</Type><Show when={gate.provider}><Type variant="caption">{gate.provider}</Type></Show></div><GateStatusMark status={gate.status} /></li>}</For></ul></Show><Button variant="secondary">View community</Button>
  </CardContent></Card>;
}

const base: CommunitySidebarProps = { displayName: "Infinity", description: "To infinity and beyond", followers: 18_400, members: 1_270, mode: "unknown", referenceLinks: [{ href: "https://example.com/community", label: "Community site", position: 1 }, { href: "https://example.com/rules", label: "Full rules", position: 2 }], rules: [{ body: "Keep discussion constructive.", position: 1, title: "Be constructive" }, { body: "Use a descriptive flair.", position: 2, title: "Flair posts" }] };
const meta = { title: "App/Community/Sidebar", component: CommunitySidebar, args: base, parameters: { layout: "centered" } } satisfies Meta<typeof CommunitySidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { render: () => <CommunitySidebar {...base} gates={[]} /> };
export const OwnerAndModerators: Story = { name: "Roles / Owner and moderators", render: () => <CommunitySidebar {...base} description="A community with visible creator and moderation roles." owner={{ displayName: "Captain Signal", handle: "captain.pirate", role: "owner" }} moderators={[{ displayName: "Mod Matrix", handle: "modmatrix.pirate", role: "moderator" }, { displayName: "Admin Current", handle: "admincurrent.pirate", role: "admin" }]} gates={[]} /> };
export const RequirementsAnd: Story = { name: "Gates / AND mode", render: () => <CommunitySidebar {...base} mode="all" gates={[{ type: "wallet_score", label: "Passport score 8+", status: "met" }, { type: "unique_human", label: "Palm scan", provider: "very", status: "unmet" }]} /> };
export const RequirementsOr: Story = { name: "Gates / OR mode", render: () => <CommunitySidebar {...base} mode="any" gates={[{ type: "wallet_score", label: "Passport score 8+", status: "met" }, { type: "unique_human", label: "Palm scan", provider: "very", status: "unmet" }, { type: "asset_balance", label: "At least 0.5 ETH", status: "unmet" }]} /> };
export const ProofOfWorkOnly: Story = { name: "Gates / Browser check only", render: () => <CommunitySidebar {...base} hasActionTimeCheck mode="all" gates={[]} /> };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <CommunitySidebar {...base} mobile mode="all" gates={[{ type: "wallet_score", label: "Passport score 8+", status: "met" }]} /> };

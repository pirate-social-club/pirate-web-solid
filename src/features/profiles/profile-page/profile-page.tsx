import { For, Show, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger, Type } from "../../../design-system";

export interface ProfileActivityItem {
  readonly id: string;
  readonly kind: "post" | "comment";
  readonly title: string;
  readonly body: string;
  readonly context?: string;
}
export interface ProfilePageActivity {
  readonly items: readonly ProfileActivityItem[];
  readonly stats?: readonly { label: string; value: string }[];
  readonly walletPanel?: JSX.Element;
  readonly bookPanel?: JSX.Element;
}

/** Solid-owned activity composition following the reference ProfilePage tabs. */
export function ProfilePage(props: { activity?: ProfilePageActivity }) {
  const [tab, setTab] = createSignal("overview");
  const items = () => props.activity?.items.filter(item => tab() === "overview" || item.kind === (tab() === "posts" ? "post" : "comment")) ?? [];
  return <div class="mt-8 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
    <Tabs value={tab()} onChange={setTab} class="min-w-0">
      <TabsList variant="underline" class="flex" aria-label="Profile content">
        <TabsTrigger variant="underline" value="overview" class="flex-1 px-3">Overview</TabsTrigger>
        <TabsTrigger variant="underline" value="posts" class="flex-1 px-3">Posts</TabsTrigger>
        <TabsTrigger variant="underline" value="comments" class="flex-1 px-3">Comments</TabsTrigger>
        <Show when={props.activity?.walletPanel}><TabsTrigger variant="underline" value="wallet" class="flex-1 px-3">Wallet</TabsTrigger></Show>
        <Show when={props.activity?.bookPanel}><TabsTrigger variant="underline" value="book" class="flex-1 px-3">Book</TabsTrigger></Show>
      </TabsList>
      <For each={["overview", "posts", "comments"]}>{value => <TabsContent value={value} class="space-y-4 py-6">
        <Show when={props.activity} fallback={<Type class="text-muted-foreground">Profile activity is not available yet.</Type>}>
          <Show when={items().length} fallback={<Type class="text-muted-foreground">No activity yet.</Type>}>
            <For each={items()}>{item => <Card><CardContent class="space-y-2 p-4">
              <Type variant="caption" class="text-muted-foreground">{item.kind === "post" ? "Post" : "Comment"}{item.context ? ` · ${item.context}` : ""}</Type>
              <Type as="h2" variant="h4">{item.title}</Type><Type>{item.body}</Type>
            </CardContent></Card>}</For>
          </Show>
        </Show>
      </TabsContent>}</For>
      <Show when={props.activity?.walletPanel}>{panel => <TabsContent value="wallet" class="py-6">{panel()}</TabsContent>}</Show>
      <Show when={props.activity?.bookPanel}>{panel => <TabsContent value="book" class="py-6">{panel()}</TabsContent>}</Show>
    </Tabs>
    <Show when={props.activity?.stats?.length}><aside aria-label="Profile statistics" class="space-y-4 rounded-xl border border-border p-4 lg:mt-14">
      <For each={props.activity?.stats}>{stat => <div class="flex justify-between gap-4"><Type class="text-muted-foreground">{stat.label}</Type><Type variant="body-strong">{stat.value}</Type></div>}</For>
    </aside></Show>
  </div>;
}

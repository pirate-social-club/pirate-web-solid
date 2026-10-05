import { For, createSignal, onCleanup } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../design-system";

const activityTabs = ["overview", "posts", "comments"] as const;
type ActivityTab = typeof activityTabs[number];

/** Presentation only: public routes do not mount this until an activity read exists. */
export function ProfilePage(props: { renderOverview: () => JSX.Element; renderPosts: () => JSX.Element; renderComments: () => JSX.Element }) {
  const [tab, setTab] = createSignal<ActivityTab>("overview");
  const readHash = () => {
    const next = activityTabs.find(value => `#${value}` === window.location.hash);
    setTab(next ?? "overview");
  };
  if (typeof window !== "undefined") {
    queueMicrotask(readHash);
    window.addEventListener("hashchange", readHash);
    onCleanup(() => window.removeEventListener("hashchange", readHash));
  }
  const select = (value: string) => {
    const next = activityTabs.find(tab => tab === value);
    if (!next) return;
    setTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.hash = next;
      window.history.replaceState(window.history.state, "", url);
    }
  };
  return <Tabs value={tab()} onChange={select} class="min-w-0">
    <TabsList variant="underline" class="flex" aria-label="Profile content">
      <For each={activityTabs}>{value => <TabsTrigger variant="underline" value={value} class="flex-1 px-3">{{ overview: "Overview", posts: "Posts", comments: "Comments" }[value]}</TabsTrigger>}</For>
    </TabsList>
    <TabsContent value="overview" class="space-y-4 py-6">{props.renderOverview()}</TabsContent>
    <TabsContent value="posts" class="space-y-4 py-6">{props.renderPosts()}</TabsContent>
    <TabsContent value="comments" class="space-y-4 py-6">{props.renderComments()}</TabsContent>
  </Tabs>;
}

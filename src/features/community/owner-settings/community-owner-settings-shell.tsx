import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import {
  Button,
  Card,
  FlatTabBar,
  FlatTabButton,
  Spinner,
  Type,
  cn,
} from "@pirate/web-solid-ui";
import {
  firstVisibleOwnerSettingsSection,
  visibleOwnerSettingsGroups,
  type OwnerSettingsAccess,
  type OwnerSettingsSection,
} from "./owner-settings-model";

export interface CommunityOwnerSettingsShellProps {
  access: OwnerSettingsAccess;
  activeSection: OwnerSettingsSection;
  children: JSX.Element;
  class?: string;
  communityName: string;
  dirtySections?: ReadonlyArray<OwnerSettingsSection>;
  errorMessage?: string;
  onRetry?: () => void;
  onCommunityClick?: () => void;
  onSectionChange: (section: OwnerSettingsSection) => void;
  status?: "ready" | "loading" | "empty" | "error";
}

export function CommunityOwnerSettingsShell(props: CommunityOwnerSettingsShellProps) {
  const status = () => props.status ?? "ready";
  const groups = () => visibleOwnerSettingsGroups(props.access);
  const dirty = () => new Set(props.dirtySections ?? []);
  const activeLabel = () => groups().flatMap((group) => group.items).find((item) => item.section === props.activeSection)?.label ?? "Settings";
  const activeTitle = () => ({
    profile: "Community profile",
    namespace: "Community address",
    names: "Community names",
    rules: "Rules",
    links: "Links",
    moderation_queue: "Moderation queue",
    content_policy: "Content policy",
    archive: "Archive community",
  } satisfies Record<OwnerSettingsSection, string>)[props.activeSection];

  return (
    <main class={cn("min-h-[calc(100dvh-4rem)] bg-muted/20", props.class)} data-owner-settings-shell>
      <header class="border-b border-border-soft bg-background">
        <div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 md:px-8">
          <div class="min-w-0">
            <Type as="p" class="truncate text-muted-foreground" variant="caption">{props.communityName}</Type>
            <Type as="h1" class="truncate" variant="h2">{activeTitle()}</Type>
          </div>
          <Show when={props.onCommunityClick}>
            <Button onClick={props.onCommunityClick} variant="outline">View community</Button>
          </Show>
        </div>
      </header>

      <Show when={groups().length > 0}>
        <nav aria-label="Owner settings sections" class="sticky top-16 z-20 border-b border-border-soft bg-background/95 px-4 backdrop-blur-md md:top-0 md:px-8">
          <div class="mx-auto w-full max-w-6xl">
            <FlatTabBar>
              <For each={groups().flatMap((group) => group.items)}>
                {(item) => (
                  <FlatTabButton active={item.section === props.activeSection} onClick={() => props.onSectionChange(item.section)}>
                    {item.label}{dirty().has(item.section) ? " •" : ""}
                  </FlatTabButton>
                )}
              </For>
            </FlatTabBar>
          </div>
        </nav>
      </Show>

      <section aria-label={activeLabel()} class="mx-auto min-w-0 max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <Show when={groups().length > 0 && status() === "ready"}>
              <Type as="h2" class="sr-only" variant="h2">{activeTitle()} settings</Type>
            </Show>
            <Show
              when={groups().length > 0}
              fallback={
                <Card class="p-6">
                  <Type as="h2" variant="h2">No owner settings available</Type>
                  <Type as="p" class="mt-2 text-muted-foreground" variant="body">
                    Your current role does not include any community management capabilities.
                  </Type>
                </Card>
              }
            >
              <Show when={status() === "ready"}>{props.children}</Show>
              <Show when={status() === "loading"}>
                <Card class="grid min-h-64 place-items-center p-8" role="status">
                  <div class="flex items-center gap-3"><Spinner class="size-5" /><Type variant="body">Loading {activeLabel().toLowerCase()}&hellip;</Type></div>
                </Card>
              </Show>
              <Show when={status() === "empty"}>
                <Card class="p-8 text-center">
                  <Type as="h2" variant="h2">Nothing to configure yet</Type>
                  <Type as="p" class="mt-2 text-muted-foreground" variant="body">This section will appear when the community is ready for it.</Type>
                </Card>
              </Show>
              <Show when={status() === "error"}>
                <Card class="p-8" role="alert">
                  <Type as="h2" variant="h2">Settings could not be loaded</Type>
                  <Type as="p" class="mt-2 text-muted-foreground" variant="body">{props.errorMessage ?? "Try again in a moment."}</Type>
                  <Show when={props.onRetry}><Button class="mt-5" onClick={props.onRetry}>Try again</Button></Show>
                </Card>
              </Show>
            </Show>
      </section>
    </main>
  );
}

export { firstVisibleOwnerSettingsSection };

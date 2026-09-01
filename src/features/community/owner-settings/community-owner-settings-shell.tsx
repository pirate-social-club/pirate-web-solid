import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import {
  Button,
  Card,
  CommunityAvatar,
  Spinner,
  StackedSectionNav,
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
  avatarUrl?: string | null;
  children: JSX.Element;
  class?: string;
  communityName: string;
  dirtySections?: ReadonlyArray<OwnerSettingsSection>;
  errorMessage?: string;
  onRetry?: () => void;
  onSectionChange: (section: OwnerSettingsSection) => void;
  status?: "ready" | "loading" | "empty" | "error";
}

export function CommunityOwnerSettingsShell(props: CommunityOwnerSettingsShellProps) {
  const status = () => props.status ?? "ready";
  const groups = () => visibleOwnerSettingsGroups(props.access);
  const dirty = () => new Set(props.dirtySections ?? []);
  const activeLabel = () => groups().flatMap((group) => group.items).find((item) => item.section === props.activeSection)?.label ?? "Settings";
  const navSections = () => groups().map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      active: item.section === props.activeSection,
      description: `${item.description}${dirty().has(item.section) ? " · Unsaved" : ""}`,
      label: item.label,
      onSelect: () => props.onSectionChange(item.section),
    })),
  }));

  return (
    <main class={cn("min-h-screen bg-muted/20", props.class)} data-owner-settings-shell>
      <header class="border-b border-border-soft bg-background">
        <div class="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-5 md:px-8">
          <CommunityAvatar
            avatarSrc={props.avatarUrl ?? undefined}
            communityId={props.communityName}
            displayName={props.communityName}
            size="md"
          />
          <div class="min-w-0">
            <Type as="p" class="truncate" variant="body-strong">{props.communityName}</Type>
            <Type as="h1" class="truncate" variant="h2">Owner settings</Type>
          </div>
        </div>
      </header>

      <div class="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 md:grid-cols-[18rem_minmax(0,1fr)] md:px-8 md:py-8">
        <Show when={groups().length > 0}>
          <aside aria-label="Owner settings sections" class="hidden md:block">
            <StackedSectionNav sections={navSections()} />
          </aside>

          <div class="md:hidden">
            <label class="sr-only" for="owner-settings-section">Settings section</label>
            <select
              aria-label="Settings section"
              class="h-12 w-full rounded-full border border-input bg-background px-4"
              id="owner-settings-section"
              onChange={(event) => {
                const selected = groups().flatMap((group) => group.items).find((item) => item.section === event.currentTarget.value);
                if (selected) props.onSectionChange(selected.section);
              }}
              value={props.activeSection}
            >
              <For each={groups()}>
                {(group) => (
                  <optgroup label={group.label}>
                    <For each={group.items}>
                      {(item) => <option value={item.section}>{item.label}{dirty().has(item.section) ? " · Unsaved" : ""}</option>}
                    </For>
                  </optgroup>
                )}
              </For>
            </select>
          </div>
        </Show>

        <section aria-label={activeLabel()} class="min-w-0">
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
      </div>
    </main>
  );
}

export { firstVisibleOwnerSettingsSection };

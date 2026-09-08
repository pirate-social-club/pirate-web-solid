import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import {
  Button,
  Card,
  CommunityAvatar,
  IconArchive,
  IconAt,
  IconButton,
  IconChatCircleDots,
  IconEye,
  IconGavel,
  IconImageSquare,
  IconLinkSimple,
  IconQueue,
  IconSealCheck,
  IconTelegramLogo,
  IconX,
  Spinner,
  Type,
  cn,
} from "../../../design-system";
import {
  firstVisibleOwnerSettingsSection,
  visibleOwnerSettingsGroups,
  type OwnerSettingsAccess,
  type OwnerSettingsSection,
} from "./owner-settings-model";

type SectionIcon = (props: { class?: string; filled?: boolean }) => JSX.Element;

const SECTION_ICONS = {
  moderation_queue: IconQueue,
  profile: IconImageSquare,
  namespace: IconSealCheck,
  names: IconAt,
  rules: IconGavel,
  links: IconLinkSimple,
  content_policy: IconEye,
  telegram: IconTelegramLogo,
  assistant: IconChatCircleDots,
  archive: IconArchive,
} satisfies Record<OwnerSettingsSection, SectionIcon>;

const SECTION_TITLES = {
  profile: "Community profile",
  namespace: "Community address",
  names: "Community names",
  rules: "Rules",
  links: "Links",
  moderation_queue: "Moderation queue",
  content_policy: "Content policy",
  telegram: "Telegram",
  assistant: "Assistant",
  archive: "Archive community",
} satisfies Record<OwnerSettingsSection, string>;

export interface CommunityManagementShellProps {
  access: OwnerSettingsAccess;
  activeSection: OwnerSettingsSection;
  children: JSX.Element;
  class?: string;
  communityAvatarSrc?: string | null;
  communityId?: string;
  communityName: string;
  dirtySections?: ReadonlyArray<OwnerSettingsSection>;
  errorMessage?: string;
  onExit?: () => void;
  onRetry?: () => void;
  onSectionChange: (section: OwnerSettingsSection) => void;
  status?: "ready" | "loading" | "empty" | "error";
  unavailableSections?: ReadonlyArray<OwnerSettingsSection>;
}

function SectionNav(props: CommunityManagementShellProps & { groups: ReturnType<typeof visibleOwnerSettingsGroups> }) {
  const dirty = () => new Set(props.dirtySections ?? []);
  return (
    <For each={props.groups}>
      {(group, groupIndex) => (
        <div class={cn("px-4", groupIndex() > 0 && "mt-4 border-t border-border-soft pt-4")}>
          <Type as="p" class="px-2 pb-2 uppercase tracking-[0.03em] text-muted-foreground" variant="caption">
            {group.label}
          </Type>
          <ul class="flex flex-col gap-1">
            <For each={group.items}>
              {(item) => {
                const active = () => item.section === props.activeSection;
                const Icon = SECTION_ICONS[item.section];
                return (
                  <li>
                    <button
                      aria-current={active() ? "page" : undefined}
                      class={cn(
                        "flex h-12 w-full items-center gap-3 rounded-[var(--radius-lg)] px-3 text-start transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                        active() ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                      onClick={() => props.onSectionChange(item.section)}
                      type="button"
                    >
                      <Icon class="size-5 shrink-0" filled={active()} />
                      <Type as="span" class="min-w-0 flex-1 truncate" variant="body-strong">{item.label}</Type>
                      <Show when={dirty().has(item.section)}>
                        <span aria-hidden="true" class="size-2 shrink-0 rounded-full bg-primary" />
                        <span class="sr-only">Unsaved changes</span>
                      </Show>
                    </button>
                  </li>
                );
              }}
            </For>
          </ul>
        </div>
      )}
    </For>
  );
}

/**
 * The management surface owns the whole viewport. It carries its own sidebar,
 * heading and exit control in place of the application chrome, which the route
 * policy suppresses, so an owner never sees one navigation column nested
 * inside another.
 */
export function CommunityManagementShell(props: CommunityManagementShellProps) {
  const status = () => props.status ?? "ready";
  const groups = () => visibleOwnerSettingsGroups(props.access, props.unavailableSections);
  const activeTitle = () => SECTION_TITLES[props.activeSection];

  return (
    <div class={cn("flex min-h-[100dvh] bg-background text-foreground md:min-h-screen", props.class)} data-community-management-shell>
      <Show when={groups().length > 0}>
        {/* The identity head and the exit control sit outside the navigation
            landmark so the landmark contains section links and nothing else. */}
        <div class="sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-y-auto border-e border-border-soft py-5 md:flex">
          <div class="mb-5 flex items-center gap-2 px-4">
            <Show when={props.onExit}>
              <IconButton aria-label="Close community management" class="-ms-1" onClick={props.onExit} variant="ghost">
                <IconX class="size-5" />
              </IconButton>
            </Show>
            <CommunityAvatar
              avatarSrc={props.communityAvatarSrc}
              class="size-10 shrink-0"
              communityId={props.communityId ?? props.communityName}
              displayName={props.communityName}
            />
            <Type as="p" class="min-w-0 truncate" variant="body-strong">{props.communityName}</Type>
          </div>
          <nav aria-label="Community management" class="flex flex-col">
            <SectionNav {...props} groups={groups()} />
          </nav>
        </div>
      </Show>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="sticky top-0 z-10 border-b border-border-soft bg-background md:hidden">
          <div class="flex items-center gap-2 px-2 py-3">
            <Show when={props.onExit}>
              <IconButton aria-label="Close community management" onClick={props.onExit} variant="ghost">
                <IconX class="size-5" />
              </IconButton>
            </Show>
            <div class="min-w-0">
              <Type as="p" class="truncate text-muted-foreground" variant="caption">{props.communityName}</Type>
              <Type as="h1" class="truncate" variant="h4">{activeTitle()}</Type>
            </div>
          </div>
          <Show when={groups().length > 0}>
            <div class="flex gap-1 overflow-x-auto px-2 pb-2">
              <For each={groups().flatMap((group) => group.items)}>
                {(item) => (
                  <Button
                    aria-current={item.section === props.activeSection ? "page" : undefined}
                    class="shrink-0"
                    onClick={() => props.onSectionChange(item.section)}
                    size="sm"
                    variant={item.section === props.activeSection ? "secondary" : "ghost"}
                  >
                    {item.label}
                  </Button>
                )}
              </For>
            </div>
          </Show>
        </header>

        <main aria-label={activeTitle()} class="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div class="mx-auto w-full max-w-5xl">
            <Type as="h1" class="mb-6 hidden md:block" variant="h2">{activeTitle()}</Type>
            {/* Panels start their own headings at h2 or h3. This bridge keeps
                the document order unbroken when a panel suppresses its own
                heading because the shell already names the section. */}
            <Type as="h2" class="sr-only" variant="h2">{activeTitle()} settings</Type>
            <Show
              when={groups().length > 0}
              fallback={
                <Card class="p-6">
                  <Type as="h2" variant="h2">No management tools available</Type>
                  <Type as="p" class="mt-2 text-muted-foreground" variant="body">
                    Your current role does not include any community management capabilities.
                  </Type>
                </Card>
              }
            >
              <Show when={status() === "ready"}>{props.children}</Show>
              <Show when={status() === "loading"}>
                <Card class="grid min-h-64 place-items-center p-8" role="status">
                  <div class="flex items-center gap-3">
                    <Spinner class="size-5" />
                    <Type variant="body">Loading {activeTitle().toLowerCase()}&hellip;</Type>
                  </div>
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
          </div>
        </main>
      </div>
    </div>
  );
}

export { firstVisibleOwnerSettingsSection };

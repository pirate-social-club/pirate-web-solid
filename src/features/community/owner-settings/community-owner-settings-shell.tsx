import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import {
  AppHeader,
  Button,
  Card,
  CommunityAvatar,
  FlatTabBar,
  FlatTabButton,
  IconCrown,
  IconGlobe,
  IconLink,
  IconListNumbers,
  IconShield,
  IconTrash,
  IconUsers,
  IconUsersThree,
  MobileFooterNav,
  Spinner,
  Type,
  cn,
} from "@pirate/web-solid-ui";
import {
  AppSidebar,
  SidebarContent,
  type SidebarSection,
} from "../../shell/app-sidebar/app-sidebar";
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
  const iconBySection = {
    profile: <IconUsers class="size-5" />,
    namespace: <IconGlobe class="size-5" />,
    names: <IconCrown class="size-5" />,
    rules: <IconListNumbers class="size-5" />,
    links: <IconLink class="size-5" />,
    membership_requests: <IconUsersThree class="size-5" />,
    moderation: <IconShield class="size-5" />,
    archive: <IconTrash class="size-5" />,
  } satisfies Record<OwnerSettingsSection, JSX.Element>;
  const sidebarSections = (): readonly SidebarSection[] => groups().map((group) => ({
    id: group.label.toLowerCase().replaceAll(" ", "-"),
    label: group.label,
    items: group.items.map((item) => ({
      badge: dirty().has(item.section) ? "Unsaved" : undefined,
      icon: iconBySection[item.section],
      id: item.section,
      label: item.label,
    })),
  }));
  const selectSection = (id: string) => {
    const selected = groups().flatMap((group) => group.items).find((item) => item.section === id);
    if (selected) props.onSectionChange(selected.section);
  };

  return (
    <main class={cn("min-h-screen bg-background", props.class)} data-owner-settings-shell>
      <div class="flex min-h-screen">
        <Show when={groups().length > 0}>
          <AppSidebar
            activeItemId={props.activeSection}
            brandLabel={props.communityName}
            class="sticky top-0 hidden h-dvh md:flex"
            homeAriaLabel="Open community profile settings"
            onHomeClick={() => props.onSectionChange("profile")}
            onNavigate={selectSection}
            sections={sidebarSections()}
          />
        </Show>

        <SidebarContent class="min-h-screen bg-muted/20 pb-20 md:pb-0">
          <div class="md:hidden">
            <AppHeader
              avatarFallback={props.communityName}
              forceMobile
              hideBrand
              mobileCenterContent={<Type as="span" variant="h4">Owner settings</Type>}
              mobileTrailingContent={
                <CommunityAvatar
                  avatarSrc={props.avatarUrl ?? undefined}
                  communityId={props.communityName}
                  displayName={props.communityName}
                  size="sm"
                />
              }
              onBackClick={() => props.onSectionChange("profile")}
              showCreateAction={false}
              showNotificationsAction={false}
              showProfileAction={false}
            />
          </div>

          <header class="hidden border-b border-border-soft bg-background md:block">
            <div class="mx-auto flex w-full max-w-6xl items-center gap-4 px-8 py-5">
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

          <Show when={groups().length > 0}>
            <nav aria-label="Owner settings sections" class="sticky top-16 z-20 border-b border-border-soft bg-background/95 px-4 backdrop-blur-md md:hidden">
              <FlatTabBar>
                <For each={groups().flatMap((group) => group.items)}>
                  {(item) => (
                    <FlatTabButton active={item.section === props.activeSection} onClick={() => props.onSectionChange(item.section)}>
                      {item.label}{dirty().has(item.section) ? " •" : ""}
                    </FlatTabButton>
                  )}
                </For>
              </FlatTabBar>
            </nav>
          </Show>

          <section aria-label={activeLabel()} class="mx-auto min-w-0 max-w-6xl px-4 py-6 pt-24 md:px-8 md:py-8">
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

          <div class="md:hidden">
            <MobileFooterNav
              activeItem="profile"
              avatarFallback={props.communityName}
              forceMobile
              userAvatarSrc={props.avatarUrl ?? undefined}
            />
          </div>
        </SidebarContent>
      </div>
    </main>
  );
}

export { firstVisibleOwnerSettingsSection };

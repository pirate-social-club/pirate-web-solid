import { Title } from "@solidjs/meta";
import { Button, Card, Type } from "@pirate/web-solid-ui";
import { Loading, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { getRequestEvent } from "@solidjs/web";

import type { CommunityModerationSettingsApi } from "./community-moderation-settings-api";
import type { CommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import { CommunityTelegramSettingsController } from "./community-telegram-settings-controller";
import { CommunityNamespaceSettingsController } from "./community-namespace-settings-controller";
import { CommunityModerationSettingsController } from "./community-moderation-settings-controller";
import type { CommunityNamesSettingsApi } from "./community-names-settings-api";
import { CommunityNamesSettingsController } from "./community-names-settings-controller";
import { CommunityManagementSections, CommunityManagementShell } from "./community-management-shell";
import {
  firstRoutedOwnerSettingsSection,
  routedOwnerSettingsSection,
  type OwnerSettingsRouteState,
  type RoutedOwnerSettingsSection,
} from "./owner-settings-route-model";
import { visibleOwnerSettingsGroups } from "./owner-settings-model";
import { settledBotAccess, type OwnerSettingsBotAccess } from "./owner-settings-route-model";
import { createCommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import type { CommunityNamespaceSettingsPort } from "./owner-settings-model";

export interface OwnerSettingsRouteViewProps {
  /** The deferred bot probe needs only this read, so it is injected narrowly. */
  botProbeApi?: Pick<CommunityTelegramSettingsApi, "getSettings">;
  moderationApi?: CommunityModerationSettingsApi;
  telegramApi?: CommunityTelegramSettingsApi;
  namespaceApi?: CommunityNamespaceSettingsPort;
  namesApi?: CommunityNamesSettingsApi;
  navigate: (href: string, options?: { replace?: boolean }) => void;
  /** `null` renders the management index instead of a section. */
  requestedSection: string | null;
  state: OwnerSettingsRouteState | PromiseLike<OwnerSettingsRouteState>;
}

interface ResolvedOwnerSettingsRouteViewProps extends Omit<OwnerSettingsRouteViewProps, "state"> {
  state: OwnerSettingsRouteState;
}

/**
 * The management surface keeps state in the document URL that route state does
 * not hold: the namespace API reads an in-flight HNS import session straight
 * from `location.href`. A section change that rebuilt a bare path would drop
 * that parameter and destroy the import, so the search string travels with
 * every navigation this view performs. Reading it through the request event on
 * the server keeps the behaviour identical before and after hydration.
 */
function currentSearch(): string {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).search;
  if (typeof location === "undefined") return "";
  return new URL(location.href).search;
}

export function ownerSettingsSectionHref(
  communityPath: string,
  section: string,
  search: string,
): string {
  return `${communityPath}/settings/${section}${search}`;
}

function RouteMessage(props: { state: OwnerSettingsRouteState }) {
  const copy = () => {
    if (props.state.kind === "denied") {
      return {
        body: "These settings are available only to this community's owner.",
        title: "Owner access required",
      };
    }
    if (props.state.kind === "not-found") {
      return { body: "This community could not be found.", title: "Community not found" };
    }
    if (props.state.kind === "invalid") {
      return { body: "The community address is invalid.", title: "Invalid community address" };
    }
    return {
      body: "Community settings could not be loaded. Try again in a moment.",
      title: "Settings unavailable",
    };
  };
  return (
    <main class="grid min-h-dvh place-items-center bg-background p-4" data-owner-settings-route-state={props.state.kind}>
      <Title>{copy().title}</Title>
      <Card class="w-full max-w-lg p-6">
        <Type as="h1" variant="h2">{copy().title}</Type>
        <Type as="p" class="mt-2 text-muted-foreground" variant="body">{copy().body}</Type>
        <Show when={props.state.kind === "error" || props.state.kind === "unavailable"}>
          <Button class="mt-4" onClick={() => window.location.reload()}>Try again</Button>
        </Show>
      </Card>
    </main>
  );
}

function ResolvedOwnerSettingsRouteView(props: ResolvedOwnerSettingsRouteViewProps) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  const indexMode = () => props.requestedSection === null;

  // Resolved after entry, so the sections the route already authorized are
  // usable while this is still in flight.
  const [botAccess, setBotAccess] = createSignal<OwnerSettingsBotAccess>();
  const [botPending, setBotPending] = createSignal(true);
  let live = true;
  onCleanup(() => { live = false; });
  createEffect(
    () => success()?.communityId,
    (communityId) => {
      if (communityId === undefined) return;
      queueMicrotask(() => {
        if (!live) return;
        setBotPending(true);
        void settledBotAccess(
          { telegramApi: props.botProbeApi ?? props.telegramApi ?? createCommunityTelegramSettingsApi() },
          communityId,
        )
          .then((result) => { if (live) setBotAccess(result); })
          .finally(() => { if (live) setBotPending(false); });
      });
    },
  );
  const access = createMemo(() => {
    const state = success();
    if (state === undefined) return {};
    return botAccess()?.granted === true
      ? { ...state.access, "community.bot.manage": true }
      : state.access;
  });
  const unavailable = createMemo(() => {
    const state = success();
    const base = state?.unavailableSections ?? [];
    return botAccess()?.unavailable === true
      ? [...base, "telegram" as const, "assistant" as const]
      : base;
  });
  const activeSection = createMemo<RoutedOwnerSettingsSection | null>(() => {
    const state = success();
    if (state === undefined || indexMode()) return null;
    const requested = routedOwnerSettingsSection(props.requestedSection ?? undefined);
    if (requested !== null) {
      const visible = visibleOwnerSettingsGroups(access(), unavailable())
        .flatMap((group) => group.items)
        .some((item) => item.section === requested);
      if (visible) return requested;
      // A direct link to a bot section waits for its probe rather than being
      // bounced to the landing section before the answer is known.
      if ((requested === "telegram" || requested === "assistant") && botPending()) return null;
    }
    return firstRoutedOwnerSettingsSection(access(), unavailable());
  });

  createEffect(
    () => ({ active: activeSection(), requested: props.requestedSection, state: success() }),
    ({ active, requested, state }) => {
      // The index is a destination, never corrected to a section.
      if (active !== null && state !== undefined && requested !== null && active !== requested) {
        const href = ownerSettingsSectionHref(state.communityPath, active, currentSearch());
        queueMicrotask(() => props.navigate(href, { replace: true }));
      }
    },
  );

  return (
    <Show when={success()} fallback={<RouteMessage state={props.state} />}>
      {(state) => (
        <Show
          when={!indexMode()}
          fallback={
            <>
              <Title>{state().communityName} settings</Title>
              <CommunityManagementShell
                access={access()}
                unavailableSections={unavailable()}
                activeSection={null}
                communityAvatarSrc={state().avatarUrl}
                communityId={state().communityId}
                communityName={state().communityName}
                onExit={() => props.navigate(state().communityPath)}
                onSectionChange={(next) => props.navigate(ownerSettingsSectionHref(state().communityPath, next, currentSearch()))}
              >
                <CommunityManagementSections
                  access={access()}
                  unavailableSections={unavailable()}
                  onSectionChange={(next) => props.navigate(ownerSettingsSectionHref(state().communityPath, next, currentSearch()))}
                />
              </CommunityManagementShell>
            </>
          }
        >
        <Show when={activeSection()}>{(section) => (
          <>
            <Title>{state().communityName} settings</Title>
            <CommunityManagementShell
              access={access()}
              unavailableSections={unavailable()}
              status={state().unavailableSections?.includes(section()) ? "error" : "ready"}
              errorMessage="This settings check failed. Your access could not be determined. Try again."
              onRetry={() => window.location.reload()}
              activeSection={section()}
              communityAvatarSrc={state().avatarUrl}
              communityId={state().communityId}
              communityName={state().communityName}
              onBack={() => props.navigate(`${state().communityPath}/settings${currentSearch()}`)}
              onExit={() => props.navigate(state().communityPath)}
              onSectionChange={(next) => props.navigate(ownerSettingsSectionHref(state().communityPath, next, currentSearch()))}
            >
              <Show when={section() === "names"}>
                <CommunityNamesSettingsController
                  api={props.namesApi}
                  communityId={state().communityId}
                />
              </Show>
              <Show when={section() === "telegram" || section() === "assistant"}>
                <CommunityTelegramSettingsController api={props.telegramApi} communityId={state().communityId} section={section() === "assistant" ? "assistant" : "telegram"} />
              </Show>
              <Show when={section() === "namespace"}>
                <CommunityNamespaceSettingsController
                  api={props.namespaceApi}
                  communityId={state().communityId}
                  communityPath={state().communityPath}
                />
              </Show>
              <Show when={section() === "moderation_queue" || section() === "content_policy"}>
                <CommunityModerationSettingsController
                  api={props.moderationApi}
                  capabilities={state().moderationCapabilities}
                  communityId={state().communityId}
                  section={section() === "moderation_queue" ? "moderation_queue" : "content_policy"}
                />
              </Show>
            </CommunityManagementShell>
          </>
        )}</Show>
        </Show>
      )}
    </Show>
  );
}

export function OwnerSettingsRouteView(props: OwnerSettingsRouteViewProps) {
  const state = createMemo(() => props.state, { deferStream: true });
  return (
    <Loading fallback={
      <main class="grid min-h-dvh place-items-center">
        <p role="status">Loading community settings…</p>
      </main>
    }>
      <ResolvedOwnerSettingsRouteView {...props} state={state()} />
    </Loading>
  );
}

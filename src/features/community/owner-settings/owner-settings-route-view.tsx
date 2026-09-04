import { Title } from "@solidjs/meta";
import { Card, Type } from "@pirate/web-solid-ui";
import { Loading, Show, createEffect, createMemo } from "solid-js";

import type { CommunityModerationSettingsApi } from "./community-moderation-settings-api";
import { CommunityNamespaceSettingsController } from "./community-namespace-settings-controller";
import { CommunityModerationSettingsController } from "./community-moderation-settings-controller";
import type { CommunityNamesSettingsApi } from "./community-names-settings-api";
import { CommunityNamesSettingsController } from "./community-names-settings-controller";
import { CommunityOwnerSettingsShell } from "./community-owner-settings-shell";
import {
  firstRoutedOwnerSettingsSection,
  routedOwnerSettingsSection,
  type OwnerSettingsRouteState,
  type RoutedOwnerSettingsSection,
} from "./owner-settings-route-model";
import { visibleOwnerSettingsGroups } from "./owner-settings-model";
import type { CommunityNamespaceSettingsPort } from "./owner-settings-model";

export interface OwnerSettingsRouteViewProps {
  moderationApi?: CommunityModerationSettingsApi;
  namespaceApi?: CommunityNamespaceSettingsPort;
  namesApi?: CommunityNamesSettingsApi;
  navigate: (href: string, options?: { replace?: boolean }) => void;
  requestedSection: string;
  state: OwnerSettingsRouteState | PromiseLike<OwnerSettingsRouteState>;
}

interface ResolvedOwnerSettingsRouteViewProps extends Omit<OwnerSettingsRouteViewProps, "state"> {
  state: OwnerSettingsRouteState;
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
      </Card>
    </main>
  );
}

function ResolvedOwnerSettingsRouteView(props: ResolvedOwnerSettingsRouteViewProps) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  const activeSection = createMemo<RoutedOwnerSettingsSection | null>(() => {
    const state = success();
    if (state === undefined) return null;
    const requested = routedOwnerSettingsSection(props.requestedSection);
    if (requested !== null) {
      const visible = visibleOwnerSettingsGroups(state.access)
        .flatMap((group) => group.items)
        .some((item) => item.section === requested);
      if (visible) return requested;
    }
    return firstRoutedOwnerSettingsSection(state.access);
  });

  createEffect(
    () => ({ active: activeSection(), requested: props.requestedSection, state: success() }),
    ({ active, requested, state }) => {
      if (active !== null && state !== undefined && active !== requested) {
        queueMicrotask(() => props.navigate(`${state.communityPath}/settings/${active}`, { replace: true }));
      }
    },
  );

  return (
    <Show when={success()} fallback={<RouteMessage state={props.state} />}>
      {(state) => (
        <Show when={activeSection()}>{(section) => (
          <>
            <Title>{state().communityName} settings</Title>
            <CommunityOwnerSettingsShell
              access={state().access}
              activeSection={section()}
              communityName={state().communityName}
              onCommunityClick={() => props.navigate(state().communityPath)}
              onSectionChange={(next) => props.navigate(`${state().communityPath}/settings/${next}`)}
            >
              <Show when={section() === "names"}>
                <CommunityNamesSettingsController
                  api={props.namesApi}
                  communityId={state().communityId}
                />
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
                  communityId={state().communityId}
                  section={section() === "moderation_queue" ? "moderation_queue" : "content_policy"}
                />
              </Show>
            </CommunityOwnerSettingsShell>
          </>
        )}</Show>
      )}
    </Show>
  );
}

export function OwnerSettingsRouteView(props: OwnerSettingsRouteViewProps) {
  const state = createMemo(() => props.state, { deferStream: true });
  return (
    <Loading fallback={<main class="grid min-h-dvh place-items-center" role="status">Loading community settings…</main>}>
      <ResolvedOwnerSettingsRouteView {...props} state={state()} />
    </Loading>
  );
}

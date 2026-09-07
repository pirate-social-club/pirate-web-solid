import { ApiClientError } from "@pirate/api-client";

import type { CommunityRouteClient } from "../../communities/community-page/community-page.model";
import { loadCommunityPage } from "../../communities/community-page/community-page.model";
import type { CommunityModerationSettingsApi } from "./community-moderation-settings-api";
import type { CommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import { ownerSettingsAccessFromModerationCapabilities } from "./community-moderation-settings-model";
import type { CommunityNamesSettingsApi } from "./community-names-settings-api";
import { ownerSettingsAccessFromNamesSnapshot } from "./community-names-settings-model";
import type { OwnerSettingsAccess, OwnerSettingsSection } from "./owner-settings-model";
import { visibleOwnerSettingsGroups } from "./owner-settings-model";

export const ROUTED_OWNER_SETTINGS_SECTIONS = [
  "namespace",
  "names",
  "moderation_queue",
  "content_policy",
  "telegram",
  "assistant",
] as const satisfies ReadonlyArray<OwnerSettingsSection>;

export type RoutedOwnerSettingsSection = typeof ROUTED_OWNER_SETTINGS_SECTIONS[number];

export type OwnerSettingsRouteState =
  | Readonly<{ kind: "invalid" | "not-found" | "unavailable" }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "error" }>
  | Readonly<{
      access: OwnerSettingsAccess;
      unavailableSections?: ReadonlyArray<RoutedOwnerSettingsSection>;
      avatarUrl: string | null;
      communityId: string;
      communityName: string;
      communityPath: string;
      kind: "success";
    }>;

export interface OwnerSettingsRouteDependencies {
  communityClient: CommunityRouteClient;
  moderationApi: Pick<CommunityModerationSettingsApi, "getCapabilities">;
  namesApi: Pick<CommunityNamesSettingsApi, "getSnapshot">;
  telegramApi?: Pick<CommunityTelegramSettingsApi, "getSettings">;
}

export function routedOwnerSettingsSection(value: string | undefined): RoutedOwnerSettingsSection | null {
  return value === "namespace" || value === "names" || value === "moderation_queue" || value === "content_policy" || value === "telegram" || value === "assistant"
    ? value
    : null;
}

export function firstRoutedOwnerSettingsSection(access: OwnerSettingsAccess, unavailableSections: ReadonlyArray<RoutedOwnerSettingsSection> = []): RoutedOwnerSettingsSection | null {
  const section = visibleOwnerSettingsGroups(access, unavailableSections)
    .flatMap((group) => group.items)
    .find((item) => routedOwnerSettingsSection(item.section) !== null)?.section;
  return routedOwnerSettingsSection(section);
}

function isRedactedOwnerResponse(reason: Error): boolean {
  return reason instanceof ApiClientError && (reason.status === 401 || reason.status === 404);
}

export async function loadOwnerSettingsRoute(
  rawPathSegment: string,
  dependencies: OwnerSettingsRouteDependencies,
  canonicalOrigin?: string | URL,
): Promise<OwnerSettingsRouteState> {
  const community = await loadCommunityPage(
    dependencies.communityClient,
    rawPathSegment,
    canonicalOrigin,
  );
  if (community.kind !== "success") return { kind: community.kind };

  const [moderation, names, telegram] = await Promise.allSettled([
    dependencies.moderationApi.getCapabilities({ communityId: community.communityId }),
    dependencies.namesApi.getSnapshot({ communityId: community.communityId }),
    dependencies.telegramApi?.getSettings({ communityId: community.communityId }) ?? Promise.resolve(null),
  ]);
  const unavailableSections: RoutedOwnerSettingsSection[] = [];
  if (moderation.status === "rejected" && !isRedactedOwnerResponse(moderation.reason)) unavailableSections.push("moderation_queue", "content_policy");
  if (names.status === "rejected" && !isRedactedOwnerResponse(names.reason)) unavailableSections.push("namespace", "names");
  if (telegram.status === "rejected" && !isRedactedOwnerResponse(telegram.reason)) unavailableSections.push("telegram", "assistant");
  let access: OwnerSettingsAccess = {};
  if (moderation.status === "fulfilled") {
    access = ownerSettingsAccessFromModerationCapabilities(moderation.value);
  }
  if (names.status === "fulfilled") {
    access = { ...access, ...ownerSettingsAccessFromNamesSnapshot(names.value) };
  }
  if (telegram.status === "fulfilled" && telegram.value !== null) access = { ...access, "community.bot.manage": true };
  if (firstRoutedOwnerSettingsSection(access, unavailableSections) === null) return { kind: "denied" };

  return {
    access,
    ...(unavailableSections.length ? { unavailableSections } : {}),
    avatarUrl: community.community.avatarSrc ?? null,
    communityId: community.communityId,
    communityName: community.community.displayName,
    communityPath: community.canonicalPath,
    kind: "success",
  };
}

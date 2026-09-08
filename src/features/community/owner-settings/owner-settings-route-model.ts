import { ApiClientError } from "@pirate/api-client";

import type { CommunityRouteClient } from "../../communities/community-page/community-page.model";
import { loadCommunityPage } from "../../communities/community-page/community-page.model";
import type { CommunityModerationSettingsApi } from "./community-moderation-settings-api";
import type { CommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import { ownerSettingsAccessFromModerationCapabilities } from "./community-moderation-settings-model";
import type { CommunityModerationCapabilities } from "./community-moderation-settings-model";
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
      /** Raw moderation capabilities, so the controller need not read them again. */
      moderationCapabilities?: CommunityModerationCapabilities;
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

export interface OwnerSettingsBotAccess {
  granted: boolean;
  unavailable: boolean;
}

/**
 * The bot probe, resolved off the entry path. It is read by the view once the
 * navigation is already on screen, and by the loader only when nothing else
 * granted access, where its answer decides denial.
 */
export async function settledBotAccess(
  dependencies: Pick<OwnerSettingsRouteDependencies, "telegramApi">,
  communityId: string,
): Promise<OwnerSettingsBotAccess> {
  if (dependencies.telegramApi === undefined) return { granted: false, unavailable: false };
  try {
    // A settings read that returns at all is the authority signal; the endpoint
    // redacts to 401 or 404 for an owner without it.
    await dependencies.telegramApi.getSettings({ communityId });
    return { granted: true, unavailable: false };
  } catch (reason) {
    if (reason instanceof Error && isRedactedOwnerResponse(reason)) {
      return { granted: false, unavailable: false };
    }
    return { granted: false, unavailable: true };
  }
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

  // Only the probes that gate the navigation block entry. The bot probe gates
  // two sections and nothing else, so making the owner wait for it before any
  // management surface appears would be paying its latency on every visit.
  const [moderation, names] = await Promise.allSettled([
    dependencies.moderationApi.getCapabilities({ communityId: community.communityId }),
    dependencies.namesApi.getSnapshot({ communityId: community.communityId }),
  ]);
  const unavailableSections: RoutedOwnerSettingsSection[] = [];
  if (moderation.status === "rejected" && !isRedactedOwnerResponse(moderation.reason)) unavailableSections.push("moderation_queue", "content_policy");
  if (names.status === "rejected" && !isRedactedOwnerResponse(names.reason)) unavailableSections.push("namespace", "names");
  let access: OwnerSettingsAccess = {};
  if (moderation.status === "fulfilled") {
    access = ownerSettingsAccessFromModerationCapabilities(moderation.value);
  }
  if (names.status === "fulfilled") {
    access = { ...access, ...ownerSettingsAccessFromNamesSnapshot(names.value) };
  }
  // Denial is only safe to decide once the deferred probe has been consulted,
  // because a community whose sole authority is the bot would look empty here.
  if (firstRoutedOwnerSettingsSection(access, unavailableSections) === null) {
    const telegram = await settledBotAccess(dependencies, community.communityId);
    if (telegram.unavailable) unavailableSections.push("telegram", "assistant");
    if (!telegram.granted && !telegram.unavailable) return { kind: "denied" };
    if (telegram.granted) access = { ...access, "community.bot.manage": true };
  }

  return {
    access,
    ...(moderation.status === "fulfilled" ? { moderationCapabilities: moderation.value } : {}),
    ...(unavailableSections.length ? { unavailableSections } : {}),
    avatarUrl: community.community.avatarSrc ?? null,
    communityId: community.communityId,
    communityName: community.community.displayName,
    communityPath: community.canonicalPath,
    kind: "success",
  };
}

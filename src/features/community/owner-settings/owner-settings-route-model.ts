import { ApiClientError } from "@pirate/api-client";

import type { CommunityRouteClient } from "../../communities/community-page/community-page.model";
import { loadCommunityPage } from "../../communities/community-page/community-page.model";
import type { CommunityModerationSettingsApi } from "./community-moderation-settings-api";
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
] as const satisfies ReadonlyArray<OwnerSettingsSection>;

export type RoutedOwnerSettingsSection = typeof ROUTED_OWNER_SETTINGS_SECTIONS[number];

export type OwnerSettingsRouteState =
  | Readonly<{ kind: "invalid" | "not-found" | "unavailable" }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "error" }>
  | Readonly<{
      access: OwnerSettingsAccess;
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
}

export function routedOwnerSettingsSection(value: string | undefined): RoutedOwnerSettingsSection | null {
  return value === "namespace" || value === "names" || value === "moderation_queue" || value === "content_policy"
    ? value
    : null;
}

export function firstRoutedOwnerSettingsSection(access: OwnerSettingsAccess): RoutedOwnerSettingsSection | null {
  const section = visibleOwnerSettingsGroups(access)
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

  const [moderation, names] = await Promise.allSettled([
    dependencies.moderationApi.getCapabilities({ communityId: community.communityId }),
    dependencies.namesApi.getSnapshot({ communityId: community.communityId }),
  ]);
  let access: OwnerSettingsAccess = {};
  if (moderation.status === "fulfilled") {
    access = ownerSettingsAccessFromModerationCapabilities(moderation.value);
  }
  if (names.status === "fulfilled") {
    access = { ...access, ...ownerSettingsAccessFromNamesSnapshot(names.value) };
  }
  if (firstRoutedOwnerSettingsSection(access) === null) {
    const unexpectedFailure = (moderation.status === "rejected" && !isRedactedOwnerResponse(moderation.reason))
      || (names.status === "rejected" && !isRedactedOwnerResponse(names.reason));
    return { kind: unexpectedFailure ? "error" : "denied" };
  }

  return {
    access,
    avatarUrl: community.community.avatarSrc ?? null,
    communityId: community.communityId,
    communityName: community.community.displayName,
    communityPath: community.canonicalPath,
    kind: "success",
  };
}

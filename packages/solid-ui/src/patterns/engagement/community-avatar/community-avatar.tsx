import { createMemo } from "solid-js";

import {
  Avatar,
  type AvatarSize,
} from "@/components/data-display/avatar/avatar";
import { IconUsersThree } from "@/components/media/icons";

export function resolveCommunityAvatarSrc(input: {
  communityId?: string;
  displayName?: string;
  avatarSrc?: string | null;
}): string | undefined {
  return input.avatarSrc?.trim() || undefined;
}

export interface CommunityAvatarProps {
  avatarSrc?: string | null;
  class?: string;
  communityId: string;
  displayName: string;
  size?: AvatarSize;
}

export function CommunityAvatar(props: CommunityAvatarProps) {
  const resolvedSrc = createMemo(() =>
    resolveCommunityAvatarSrc({
      avatarSrc: props.avatarSrc,
    }),
  );

  return (
    <Avatar
      class={props.class}
      fallback={props.displayName}
      fallbackIcon={<IconUsersThree class="size-7" />}
      size={props.size}
      src={resolvedSrc()}
    />
  );
}

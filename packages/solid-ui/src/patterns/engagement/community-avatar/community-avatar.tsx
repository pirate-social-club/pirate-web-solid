import type { JSX } from "@solidjs/web";
import { createMemo } from "solid-js";

import {
  Avatar,
  type AvatarSize,
} from "@/components/data-display/avatar/avatar";

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function toWellFormedText(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value[index] + value[index + 1];
        index += 1;
      } else {
        result += "\ufffd";
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      result += "\ufffd";
      continue;
    }
    result += value[index];
  }
  return result;
}

function sanitizeLabel(value: string): string {
  return toWellFormedText(value).trim().replace(/\s+/g, " ");
}

function buildInitials(displayName: string): string {
  const parts = sanitizeLabel(displayName)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "C";
  }

  return parts.map((part) => Array.from(part)[0]?.toUpperCase() ?? "").join("") || "C";
}

const communityAvatarPalette = [
  { bg: "#243f46", fg: "#d9f0f2" },
  { bg: "#314936", fg: "#e2f3de" },
  { bg: "#3f3a5f", fg: "#ece8ff" },
  { bg: "#4b4555", fg: "#f0eaf6" },
  { bg: "#33465f", fg: "#e6eef8" },
  { bg: "#4c4a37", fg: "#f4f0d9" },
] as const;

function buildCommunityAvatarFallback(input: {
  communityId: string;
  displayName: string;
}): JSX.Element {
  const seed = `${input.communityId.trim()}:${sanitizeLabel(input.displayName)}`;
  // Keep this palette stable: identical community inputs must resolve to the
  // same identity colors across themes and clients.
  const colors = communityAvatarPalette[hashSeed(seed) % communityAvatarPalette.length]!;

  return (
    <span
      aria-hidden="true"
      class="grid size-full place-items-center rounded-full text-[0.85em] leading-none"
      style={{ background: colors.bg, color: colors.fg }}
    >
      {buildInitials(input.displayName)}
    </span>
  );
}

export function resolveCommunityAvatarSrc(input: {
  communityId: string;
  displayName: string;
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
      communityId: props.communityId,
      displayName: props.displayName,
    }),
  );
  const fallback = createMemo(() =>
    buildCommunityAvatarFallback({
      communityId: props.communityId,
      displayName: props.displayName,
    }),
  );

  return (
    <Avatar
      class={props.class}
      fallback={props.displayName}
      fallbackIcon={fallback()}
      size={props.size}
      src={resolvedSrc()}
    />
  );
}

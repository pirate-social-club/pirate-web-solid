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

function escapeSvgText(value: string): string {
  return toWellFormedText(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
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

function encodeSvg(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toWellFormedText(svg))}`;
}

export function buildDefaultCommunityAvatarSrc(input: {
  communityId: string;
  displayName: string;
}): string {
  const seed = `${input.communityId.trim()}:${sanitizeLabel(input.displayName)}`;
  const hash = hashSeed(seed);
  // Documented exception to token discipline: this palette is deliberately
  // hardcoded so identical community inputs resolve to identical identity
  // colors across themes and clients; token substitution would break the
  // deterministic contract.
  const palette = [
    { bg: "#243f46", fg: "#d9f0f2" },
    { bg: "#314936", fg: "#e2f3de" },
    { bg: "#3f3a5f", fg: "#ece8ff" },
    { bg: "#4b4555", fg: "#f0eaf6" },
    { bg: "#33465f", fg: "#e6eef8" },
    { bg: "#4c4a37", fg: "#f4f0d9" },
  ];
  const colors = palette[hash % palette.length]!;
  const initials = buildInitials(input.displayName);
  const safeInitials = escapeSvgText(initials);

  return encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${initials}">
      <rect width="128" height="128" rx="64" fill="${colors.bg}" />
      <path d="M24 92C38 74 53 65 68 65C83 65 95 72 104 86" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="10" stroke-linecap="round" />
      <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle"
            fill="${colors.fg}" font-family="system-ui, Arial, sans-serif"
            font-size="44" font-weight="700">${safeInitials}</text>
    </svg>`,
  );
}

export function resolveCommunityAvatarSrc(input: {
  communityId: string;
  displayName: string;
  avatarSrc?: string | null;
}): string {
  const avatarSrc = input.avatarSrc?.trim();
  return avatarSrc || buildDefaultCommunityAvatarSrc(input);
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

  return (
    <Avatar
      class={props.class}
      fallback={props.displayName}
      size={props.size}
      src={resolvedSrc()}
    />
  );
}

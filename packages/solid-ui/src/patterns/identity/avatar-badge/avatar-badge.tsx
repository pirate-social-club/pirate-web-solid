import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Avatar } from "@/components/data-display/avatar/avatar";
import { BadgedCircle } from "@/components/data-display/badged-circle/badged-circle";
import { cn } from "@/lib/cn";

export type AvatarBadgeSize = "sm" | "md" | "lg";

const defaultBadgeSizeByAvatarSize: Record<AvatarBadgeSize, number> = {
  sm: 18,
  md: 22,
  lg: 26,
};

const ringWidthByBadgeSize = (badgeSize: number) => (badgeSize >= 28 ? 2 : 1);

function badgeOffsetXPercentForSize(avatarSize: AvatarBadgeSize, badgeSize: number): number {
  if (badgeSize >= 40) return 10;
  if (badgeSize >= 30) return 8;
  if (avatarSize === "sm") return 6;
  return 8;
}

function normalizeBadgeCountryCode(countryCode: string | null | undefined): string | null {
  const normalized = countryCode?.trim().toLowerCase();
  return normalized && /^[a-z]{2}$/u.test(normalized) ? normalized : null;
}

function escapeSvg(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").toUpperCase();
}

function encodeSvg(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Deterministic local badge artwork; it never performs a network request. */
export function buildDefaultAvatarBadgeSrc(countryCode: string): string {
  const normalized = normalizeBadgeCountryCode(countryCode) ?? "xx";
  const code = escapeSvg(normalized);
  const seed = normalized.charCodeAt(0) + normalized.charCodeAt(1);
  const colors = [
    ["#243f46", "#d9f0f2", "#cc291f"],
    ["#314936", "#e2f3de", "#d6a321"],
    ["#3f3a5f", "#ece8ff", "#cc291f"],
  ][seed % 3]!;
  return encodeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${colors[0]}"/><path d="M0 40h64v24H0z" fill="${colors[2]}"/><text x="32" y="34" text-anchor="middle" fill="${colors[1]}" font-family="system-ui,Arial,sans-serif" font-size="18" font-weight="700">${code}</text></svg>`);
}

export function resolveAvatarBadgeSrc(input: { badgeSrc?: string | null; countryCode: string; flagUrlForCountryCode?: (countryCode: string) => string }): string {
  return input.badgeSrc?.trim() || input.flagUrlForCountryCode?.(input.countryCode) || buildDefaultAvatarBadgeSrc(input.countryCode);
}

export interface AvatarBadgeProps {
  avatarClass?: string;
  badgeCountryCode?: string | null;
  badgeLabel: string;
  badgeSize?: number;
  badgeSrc?: string | null;
  class?: string;
  fallback: string;
  fallbackIcon?: JSX.Element;
  fallbackSeed?: string;
  fallbackSrc?: string;
  /**
   * Optional override for the deterministic local badge artwork. Remote URLs
   * are supported only when explicitly returned by this resolver.
   */
  flagUrlForCountryCode?: (countryCode: string) => string;
  size?: AvatarBadgeSize;
  src?: string;
}

/**
 * Avatar with a verification badge anchored to the corner. With a valid
 * two-letter badgeCountryCode the badge renders as a circular flag image;
 * without one the plain Avatar renders. Sizing, ring width, and offset scale
 * with the avatar size unless overridden.
 */
export function AvatarBadge(props: AvatarBadgeProps) {
  const normalizedCountryCode = () => normalizeBadgeCountryCode(props.badgeCountryCode);
  const resolvedBadgeSize = () =>
    props.badgeSize ?? defaultBadgeSizeByAvatarSize[props.size ?? "md"];
  const flagUrl = () => {
    const code = normalizedCountryCode();
    if (!code) return null;
    return resolveAvatarBadgeSrc({
      badgeSrc: props.badgeSrc,
      countryCode: code,
      flagUrlForCountryCode: props.flagUrlForCountryCode,
    });
  };

  return (
    <Show
      when={flagUrl()}
      fallback={
        <Avatar
          class={cn(props.avatarClass, props.class)}
          fallback={props.fallback}
          fallbackIcon={props.fallbackIcon}
          fallbackSeed={props.fallbackSeed}
          fallbackSrc={props.fallbackSrc}
          size={props.size}
          src={props.src}
        />
      }
    >
      {(url) => (
        <BadgedCircle
          badge={
            <img
              alt=""
              aria-hidden="true"
              class="rounded-full"
              height={resolvedBadgeSize()}
              src={url()}
              width={resolvedBadgeSize()}
            />
          }
          badgeLabel={props.badgeLabel}
          badgeOffsetXPercent={badgeOffsetXPercentForSize(
            props.size ?? "md",
            resolvedBadgeSize(),
          )}
          badgeOffsetYPercent={0}
          badgePadding={ringWidthByBadgeSize(resolvedBadgeSize())}
          badgeSize={resolvedBadgeSize()}
          class={props.class}
        >
          <Avatar
            class={props.avatarClass}
            fallback={props.fallback}
            fallbackIcon={props.fallbackIcon}
            fallbackSeed={props.fallbackSeed}
            fallbackSrc={props.fallbackSrc}
            size={props.size}
            src={props.src}
          />
        </BadgedCircle>
      )}
    </Show>
  );
}

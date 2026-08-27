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

const defaultBadgePalette = [
  { accent: "#cc291f", bg: "#243f46", fg: "#d9f0f2" },
  { accent: "#d6a321", bg: "#314936", fg: "#e2f3de" },
  { accent: "#cc291f", bg: "#3f3a5f", fg: "#ece8ff" },
] as const;

function buildDefaultAvatarBadgeMark(countryCode: string): JSX.Element {
  const normalized = countryCode.toUpperCase();
  const hash = Array.from(normalized).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  const colors = defaultBadgePalette[hash % defaultBadgePalette.length]!;

  return (
    <span
      aria-hidden="true"
      class="relative grid size-full place-items-center overflow-hidden rounded-full text-[0.55rem] font-bold leading-none"
      style={{ background: colors.bg, color: colors.fg }}
    >
      <span
        class="absolute inset-x-0 bottom-0 h-2/5"
        style={{ background: colors.accent }}
      />
      <span class="relative">{normalized}</span>
    </span>
  );
}

export function resolveAvatarBadgeSrc(input: { badgeSrc?: string | null; countryCode: string; flagUrlForCountryCode?: (countryCode: string) => string }): string | undefined {
  return input.badgeSrc?.trim() || input.flagUrlForCountryCode?.(input.countryCode) || undefined;
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
   * Optional override for the deterministic country-code mark. Remote URLs
   * are supported only when explicitly returned by this resolver.
   */
  flagUrlForCountryCode?: (countryCode: string) => string;
  size?: AvatarBadgeSize;
  src?: string;
}

/**
 * Avatar with a verification badge anchored to the corner. With a valid
 * two-letter badgeCountryCode the badge renders as a deterministic country
 * code mark unless supplied artwork is explicitly resolved; without one the
 * plain Avatar renders. Sizing, ring width, and offset scale with the avatar
 * size unless overridden.
 */
export function AvatarBadge(props: AvatarBadgeProps) {
  const normalizedCountryCode = () => normalizeBadgeCountryCode(props.badgeCountryCode);
  const resolvedBadgeSize = () =>
    props.badgeSize ?? defaultBadgeSizeByAvatarSize[props.size ?? "md"];
  const resolvedBadgeSrc = () => {
    const code = normalizedCountryCode();
    if (!code) return undefined;
    return resolveAvatarBadgeSrc({
      badgeSrc: props.badgeSrc,
      countryCode: code,
      flagUrlForCountryCode: props.flagUrlForCountryCode,
    });
  };

  return (
    <Show
      when={normalizedCountryCode()}
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
      <BadgedCircle
        badge={
          <Show
            when={resolvedBadgeSrc()}
            fallback={buildDefaultAvatarBadgeMark(normalizedCountryCode()!)}
          >
            {(url) => (
              <img
                alt=""
                aria-hidden="true"
                class="rounded-full"
                height={resolvedBadgeSize()}
                src={url()}
                width={resolvedBadgeSize()}
              />
            )}
          </Show>
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
    </Show>
  );
}

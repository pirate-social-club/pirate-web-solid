import type { JSX } from "@solidjs/web";
import {
  createMemo,
  createSignal,
  Show,
  untrack,
} from "solid-js";

import { Skeleton } from "@/components/feedback/skeleton/skeleton";
import { cn } from "@/lib/cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "size-6",
  sm: "size-9 text-base",
  md: "size-12 text-base",
  lg: "size-14 text-base",
};

export function isRenderableImageSrc(src: string): boolean {
  const trimmed = src.trim();
  const normalized = trimmed.toLowerCase();

  if (!trimmed) {
    return false;
  }

  if (
    normalized.startsWith("data:")
    || normalized.startsWith("blob:")
    || normalized.startsWith("http://")
    || normalized.startsWith("https://")
    || normalized.startsWith("/")
  ) {
    return true;
  }

  return /^[a-z0-9][a-z0-9+.-]*\.[a-z0-9]{2,6}(?:[/?#]|$)/i.test(trimmed);
}

export function isRetryableImageSrc(src: string): boolean {
  const normalized = src.trim().toLowerCase();
  return isRenderableImageSrc(normalized) && !normalized.startsWith("data:");
}

export function buildRetriedImageSrc(src: string): string {
  const trimmed = src.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    const url = typeof window === "undefined"
      ? new URL(trimmed, "http://localhost")
      : new URL(trimmed, window.location.href);
    url.searchParams.set("_img_retry", Date.now().toString());
    return url.toString();
  } catch {
    const separator = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${separator}_img_retry=${Date.now()}`;
  }
}

function buildInitials(seed: string): string {
  const parts = seed.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  const first = parts[0].charAt(0).toUpperCase();
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : "";
  return `${first}${last}`;
}

export interface AvatarProps {
  class?: string;
  /** Accessible label and initials source for the generated fallback. */
  fallback: string;
  fallbackIcon?: JSX.Element;
  /** Alternate initials seed; defaults to `fallback`. */
  fallbackSeed?: string;
  /** Alternate image shown after the primary fails. */
  fallbackSrc?: string;
  size?: AvatarSize;
  src?: string;
}

interface RetryRecord {
  primary: string;
  url: string;
}

const MAX_FAILURE_KEYS = 30;

export function Avatar(props: AvatarProps) {
  const primarySrc = createMemo(() => {
    const trimmed = props.src?.trim() || "";
    return isRenderableImageSrc(trimmed) ? trimmed : "";
  });
  const alternateSrc = createMemo(() => {
    const trimmed = props.fallbackSrc?.trim() || "";
    return isRenderableImageSrc(trimmed) ? trimmed : "";
  });

  const [retry, setRetry] = createSignal<RetryRecord | null>(null);
  const [failed, setFailed] = createSignal<Set<string>>(new Set());

  const activeRetry = createMemo(() => {
    const current = retry();
    return current && current.primary === primarySrc() ? current.url : null;
  });

  const currentSrc = createMemo(() => {
    const failures = failed();
    if (primarySrc() && !failures.has(primarySrc()) && activeRetry() == null) return primarySrc();
    if (activeRetry() && !failures.has(activeRetry()!)) return activeRetry()!;
    if (alternateSrc() && !failures.has(alternateSrc())) return alternateSrc();
    return "";
  });

  const canRenderImage = createMemo(() => currentSrc() !== "");
  const initials = createMemo(() => buildInitials(props.fallbackSeed || props.fallback));

  const handleError = () => {
    untrack(() => {
      const current = currentSrc();
      const primary = primarySrc();
      const retriedUrl = activeRetry();

      if (
        primary
        && current === primary
        && retriedUrl == null
        && isRetryableImageSrc(primary)
      ) {
        setRetry({ primary, url: buildRetriedImageSrc(primary) });
        return;
      }

      setFailed((prev) => {
        const next = prev.size >= MAX_FAILURE_KEYS ? new Set<string>() : new Set(prev);
        if (current === primary) next.add(primary);
        if (retriedUrl) next.add(retriedUrl);
        next.add(current);
        return next;
      });
    });
  };

  const className = createMemo(() =>
    cn(
      "grid shrink-0 place-items-center overflow-hidden rounded-full border border-border-soft bg-surface-skeleton font-semibold text-foreground",
      sizeClasses[props.size ?? "md"],
      props.class,
    ),
  );
  const fallbackRole = createMemo(() =>
    !canRenderImage() && (initials() || props.fallbackIcon) ? "img" : undefined,
  );

  return (
    <div
      aria-label={fallbackRole() ? props.fallback : undefined}
      class={className()}
      role={fallbackRole()}
    >
      <Show
        when={canRenderImage()}
        fallback={
          <Show
            when={props.fallbackIcon}
            fallback={
              <Show when={initials()} fallback={<Skeleton aria-hidden="true" class="size-full rounded-full" />}>
                <span aria-hidden="true">{initials()}</span>
              </Show>
            }
          >
            {props.fallbackIcon}
          </Show>
        }
      >
        <img
          alt={props.fallback}
          class="size-full rounded-full object-cover"
          onError={handleError}
          src={currentSrc()}
        />
      </Show>
    </div>
  );
}

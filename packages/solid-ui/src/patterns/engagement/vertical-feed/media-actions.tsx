import { Show } from "solid-js";

import { Avatar } from "@/components/data-display/avatar/avatar";
import { Type } from "@/components/data-display/type/type";
import { IconMusicNote } from "@/components/media/icons";
import { cn } from "@/lib/cn";

import type { MediaActionsProps } from "./types";

/** Format count with K/M suffix (e.g. 12400 -> "12.4K"). */
function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return count.toString();
}

interface IconProps {
  class?: string;
}

function IconVolumeOn(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3 9.5v5a1 1 0 0 0 1 1h3.2l4.3 3.7A1 1 0 0 0 13 18.4V5.6a1 1 0 0 0-1.5-.8L7.2 8.5H4a1 1 0 0 0-1 1Z" />
      <path
        d="M16 8.7a4.7 4.7 0 0 1 0 6.6M18.4 6a8.4 8.4 0 0 1 0 12"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
      />
    </svg>
  );
}

function IconVolumeOff(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3 9.5v5a1 1 0 0 0 1 1h3.2l4.3 3.7A1 1 0 0 0 13 18.4V5.6a1 1 0 0 0-1.5-.8L7.2 8.5H4a1 1 0 0 0-1 1Z" />
      <path
        d="m16 9.5 5 5m0-5-5 5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
      />
    </svg>
  );
}

function IconHeart(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 20.7a1 1 0 0 1-.6-.2C6 16 2.5 12.6 2.5 8.9A4.6 4.6 0 0 1 7.1 4.3c1.8 0 3.5.9 4.9 2.6 1.4-1.7 3.1-2.6 4.9-2.6a4.6 4.6 0 0 1 4.6 4.6c0 3.7-3.5 7.1-8.9 11.6a1 1 0 0 1-.6.2Z" />
    </svg>
  );
}

function IconShare(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="m8.3 10.9 7.4-4M8.3 13.1l7.4 4" />
    </svg>
  );
}

function IconPlus(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="3"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * MediaActions - vertical action column for one feed post: mute, author,
 * follow, like, share, and soundtrack. Purely presentational; every action is
 * emitted as a callback. Every action hides when its callback is absent,
 * except mute, which is local playback state and stays always visible.
 */
export function MediaActions(props: MediaActionsProps) {
  const iconButtonClass =
    "rounded-full p-3 transition-colors max-md:bg-transparent md:bg-black/30 md:backdrop-blur-sm md:hover:bg-black/40";

  return (
    <div class={cn("flex flex-col items-center gap-2 md:gap-6", props.class)}>
      {/* Mute/Unmute */}
      <button
        type="button"
        aria-label={props.isMuted ? "Unmute video" : "Mute video"}
        aria-pressed={props.isMuted ? "true" : "false"}
        class="flex cursor-pointer flex-col items-center"
        onClick={(event) => {
          event.stopPropagation();
          props.onToggleMute?.();
        }}
      >
        <div class={iconButtonClass}>
          <Show
            when={!props.isMuted}
            fallback={<IconVolumeOff class="size-8 text-foreground md:size-7" />}
          >
            <IconVolumeOn class="size-8 text-foreground md:size-7" />
          </Show>
        </div>
      </button>

      {/* Author avatar with follow badge (hidden when unwired) */}
      <Show when={props.onAuthorClick}>
        <div class="relative">
          <button
            type="button"
            aria-label={`View ${props.authorName}'s profile`}
            class="cursor-pointer"
            onClick={(event) => {
              event.stopPropagation();
              props.onAuthorClick?.();
            }}
          >
            <Avatar
              src={props.authorAvatarUrl}
              fallback={props.authorName}
              size="md"
            />
          </button>
          <Show when={!props.isFollowing && props.onFollowClick}>
            <button
              type="button"
              aria-label={`Follow ${props.authorName}`}
              class="absolute -bottom-2 left-1/2 flex size-5 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full bg-primary transition-colors hover:bg-primary-hover"
              onClick={(event) => {
                event.stopPropagation();
                props.onHaptic?.("light");
                props.onFollowClick?.();
              }}
            >
              <IconPlus class="size-3 text-primary-foreground" />
            </button>
          </Show>
        </div>
      </Show>

      {/* Like (hidden when unwired) */}
      <Show when={props.onLikeClick}>
        <button
          type="button"
          aria-label={props.isLiked ? "Unlike video" : "Like video"}
          aria-pressed={props.isLiked ? "true" : "false"}
          class="flex cursor-pointer flex-col items-center"
          onClick={(event) => {
            event.stopPropagation();
            props.onHaptic?.("double");
            props.onLikeClick?.();
          }}
        >
          <div
            class={cn(
              iconButtonClass,
              props.isLiked && "md:bg-destructive/15 md:hover:bg-destructive/20",
            )}
          >
            <IconHeart
              class={cn(
                "size-8 transition-colors md:size-7",
                props.isLiked ? "text-destructive-text" : "text-foreground",
              )}
            />
          </div>
          <Show when={props.likeCount !== undefined}>
            <Type as="span" variant="caption" class="font-semibold text-foreground">
              {formatCount(props.likeCount!)}
            </Type>
          </Show>
        </button>
      </Show>

      {/* Share (hidden when unwired) */}
      <Show when={props.onShareClick}>
        <button
          type="button"
          aria-label="Share video"
          class="flex cursor-pointer flex-col items-center"
          onClick={(event) => {
            event.stopPropagation();
            props.onShareClick?.();
          }}
        >
          <div class={iconButtonClass}>
            <IconShare class="size-8 text-foreground md:size-7" />
          </div>
        </button>
      </Show>

      {/* Soundtrack / attached media (hidden when unwired) */}
      <Show when={(props.title || props.artist) && props.onSoundtrackClick}>
        <button
          type="button"
          aria-label={
            props.title
              ? `Open ${props.title}${props.artist ? ` by ${props.artist}` : ""}`
              : "Open soundtrack"
          }
          class="group cursor-pointer"
          onClick={(event) => {
            event.stopPropagation();
            props.onSoundtrackClick?.();
          }}
        >
          <div class="flex size-12 items-center justify-center overflow-hidden rounded-full bg-primary">
            <Show
              when={props.mediaImageUrl}
              fallback={<IconMusicNote class="size-6 text-primary-foreground" />}
            >
              {(imageUrl) => (
                <img src={imageUrl()} alt="" class="h-full w-full object-cover" />
              )}
            </Show>
          </div>
        </button>
      </Show>
    </div>
  );
}

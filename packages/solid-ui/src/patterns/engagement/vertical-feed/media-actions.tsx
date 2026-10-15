import { For, Show } from "solid-js";

import { Avatar } from "@/components/data-display/avatar/avatar";
import {
  IconChatCircleDots,
  IconHeart,
  IconMicrophoneStage,
  IconMusicNote,
  IconPlus,
  IconShareNetwork,
} from "@/components/media/icons";
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

/**
 * MediaActions - vertical action column for one feed post: author, follow,
 * like, share, host activities and soundtrack. Purely presentational; every
 * action is emitted as a callback and hides when its callback is absent.
 * Mute is not a rail action: it lives in the post's More menu.
 */
export function MediaActions(props: MediaActionsProps) {
  const iconButtonClass =
    "rounded-full p-3 transition-colors max-md:bg-transparent md:bg-black/30 md:hover:bg-black/40";

  return (
    <div class={cn("flex flex-col items-center gap-2 md:gap-6", props.class)}>
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
            <span class="text-sm font-semibold leading-5 text-foreground">
              {formatCount(props.likeCount!)}
            </span>
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
            <IconShareNetwork class="size-8 text-foreground md:size-7" />
          </div>
        </button>
      </Show>

      {/* Host-offered activities, each labelled under its icon */}
      <For each={props.activities ?? []}>
        {(activity) => (
          <button
            type="button"
            aria-label={activity.label}
            class="flex cursor-pointer flex-col items-center"
            data-media-activity={activity.id}
            onClick={(event) => {
              event.stopPropagation();
              props.onActivityClick?.(activity.id);
            }}
          >
            <div class={iconButtonClass}>
              <Show
                when={activity.icon === "microphone"}
                fallback={<IconChatCircleDots class="size-8 text-foreground md:size-7" />}
              >
                <IconMicrophoneStage class="size-8 text-foreground md:size-7" />
              </Show>
            </div>
            <span class="text-sm font-semibold leading-5 text-foreground">
              {activity.label}
            </span>
          </button>
        )}
      </For>

      {/* Soundtrack / attached media (hidden when unwired) */}
      <Show when={(props.title || props.artist) && props.onSoundtrackClick}>
        <button
          type="button"
          aria-label={
            props.title
              ? `Open ${props.title}${props.artist ? ` by ${props.artist}` : ""}`
              : "Open soundtrack"
          }
          class="group cursor-pointer leading-5"
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

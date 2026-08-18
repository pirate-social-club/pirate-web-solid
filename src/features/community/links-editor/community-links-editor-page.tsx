import { For, Show, type Accessor } from "solid-js";

import {
  Button,
  FormFieldLabel,
  IconPlus,
  IconTrash,
  Input,
  Type,
  cn,
} from "@pirate/web-solid-ui";
import { getLocaleMessages } from "../../../locales";
import type { GeneratedLocaleCatalogs } from "../../../locales/generated";
import { useUiLocale } from "../../../lib/ui-locale";
import { CommunityModerationSaveFooter } from "../community-moderation-save-footer";
import {
  PLATFORM_OPTIONS,
  type CommunityLinkEditorItem,
} from "./community-links-editor-model";

export type { CommunityLinkEditorItem, ReferenceLinkPlatform } from "./community-links-editor-model";
export {
  createEmptyCommunityLinkEditorItem,
  linkSaveDisabled,
  nextLinkDraftId,
} from "./community-links-editor-model";

export interface CommunityLinksEditorPageProps {
  class?: string;
  links: CommunityLinkEditorItem[];
  onAddLink?: () => void;
  onBackClick?: () => void;
  onLinkChange?: (id: string, patch: Partial<CommunityLinkEditorItem>) => void;
  onRemoveLink?: (id: string) => void;
  onSave?: () => void;
  saveDisabled?: boolean;
  saveLoading?: boolean;
}

type LinksCopy = {
  [Key in keyof GeneratedLocaleCatalogs["en"]["routes"]["moderation"]["links"]]: string;
};

function LinkRow(props: {
  copy: () => LinksCopy;
  index: number;
  link: Accessor<CommunityLinkEditorItem>;
  onLinkChange?: (id: string, patch: Partial<CommunityLinkEditorItem>) => void;
  onRemoveLink?: (id: string) => void;
}) {
  const linkId = () => props.link().id;
  const platformId = () => `${linkId()}-platform`;
  const labelId = () => `${linkId()}-label`;
  const urlId = () => `${linkId()}-url`;

  return (
    <div class="rounded-[var(--radius-2_5xl)] border border-border-soft bg-card p-4 md:p-5" data-community-link-id={linkId()}>
      <div class="grid gap-4 md:grid-cols-[12rem_minmax(0,0.8fr)_minmax(0,1.4fr)_auto] md:items-end">
        <div class="space-y-2">
          <FormFieldLabel htmlFor={platformId()} label={props.copy().platformLabel} />
          <select
            aria-label={props.copy().platformLabel}
            class="h-12 w-full rounded-full border border-input bg-background px-4 shadow-sm outline-none transition-[color,box-shadow,border-color] focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border-soft"
            id={platformId()}
            onChange={(event) => {
              const platform = PLATFORM_OPTIONS.find((option) => option.value === event.currentTarget.value)?.value;
              if (platform) props.onLinkChange?.(linkId(), { platform });
            }}
            value={props.link().platform}
          >
            <For each={PLATFORM_OPTIONS}>
              {(option) => <option value={option.value}>{option.label}</option>}
            </For>
          </select>
        </div>

        <div class="space-y-2">
          <FormFieldLabel htmlFor={labelId()} label={props.copy().labelLabel} />
          <Input
            class="h-12 px-4 py-2"
            id={labelId()}
            onInput={(event) => props.onLinkChange?.(linkId(), { label: event.currentTarget.value })}
            placeholder={props.copy().displayNamePlaceholder}
            value={props.link().label}
          />
        </div>

        <div class="space-y-2">
          <FormFieldLabel htmlFor={urlId()} label={props.copy().urlLabel} />
          <Input
            class="h-12 px-4 py-2"
            id={urlId()}
            onInput={(event) => props.onLinkChange?.(linkId(), { url: event.currentTarget.value })}
            placeholder={props.copy().urlPlaceholder}
            type="url"
            value={props.link().url}
          />
        </div>

        <div class="flex items-center justify-end gap-2">
          <Button
            aria-label={`Delete link ${props.index + 1}`}
            class="size-12"
            onClick={() => props.onRemoveLink?.(linkId())}
            size="icon"
            variant="secondary"
          >
            <IconTrash class="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CommunityLinksEditorPage(props: CommunityLinksEditorPageProps) {
  const locale = () => useUiLocale();
  const copy = () => getLocaleMessages(locale(), "routes").moderation.links;

  return (
    <section class={cn("mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8", props.class)} data-community-links-editor>
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
        <div class="min-w-0">
          <Type as="h1" responsiveSize="desktop4xl" variant="h1">{copy().title}</Type>
        </div>
        <Button class="w-full sm:w-auto" onClick={props.onAddLink} variant="secondary">
          <IconPlus class="size-5" />
          {copy().addLink}
        </Button>
      </div>

      <div class="flex flex-col gap-4">
        <For each={props.links} keyed={false}>
          {(link, index) => (
            <LinkRow
              copy={copy}
              index={index}
              link={link}
              onLinkChange={props.onLinkChange}
              onRemoveLink={props.onRemoveLink}
            />
          )}
        </For>

        <Show when={props.links.length === 0}>
          <Type as="div" variant="caption" class="rounded-[var(--radius-2_5xl)] border border-dashed border-border-soft bg-card px-5 py-8">
            {copy().emptyState}
          </Type>
        </Show>
      </div>

      <CommunityModerationSaveFooter
        disabled={props.saveDisabled}
        loading={props.saveLoading}
        onSave={props.onSave}
      />
    </section>
  );
}

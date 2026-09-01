import {
  CommunityAvatar,
  FormFieldLabel,
  FormNote,
  Input,
  Textarea,
  Type,
} from "@pirate/web-solid-ui";
import { CommunityModerationSaveFooter } from "../community-moderation-save-footer";
import type { CommunityProfileDraft } from "./owner-settings-model";

export interface CommunityProfileSettingsPanelProps {
  draft: CommunityProfileDraft;
  onChange: (draft: CommunityProfileDraft) => void;
  onSave: () => void;
  saveDisabled?: boolean;
  saveLoading?: boolean;
}

export function CommunityProfileSettingsPanel(props: CommunityProfileSettingsPanelProps) {
  const update = (patch: Partial<CommunityProfileDraft>) => props.onChange({ ...props.draft, ...patch });

  return (
    <section class="mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8" data-community-profile-settings>
      <div class="space-y-2">
        <Type as="h2" responsiveSize="desktop4xl" variant="h1">Profile</Type>
        <Type as="p" class="max-w-2xl text-muted-foreground" variant="body">
          Control how this community appears in discovery, feeds and invitations.
        </Type>
      </div>

      <div class="grid gap-6 rounded-[var(--radius-2_5xl)] border border-border-soft bg-card p-5 md:grid-cols-[8rem_minmax(0,1fr)] md:p-6">
        <div class="flex flex-col items-center gap-3">
          <CommunityAvatar
            avatarSrc={props.draft.avatar_url ?? undefined}
            class="size-24"
            communityId={props.draft.display_name}
            displayName={props.draft.display_name || "Community"}
            size="lg"
          />
          <Type as="span" class="text-center text-muted-foreground" variant="caption">Preview</Type>
        </div>

        <div class="space-y-5">
          <div class="space-y-2">
            <FormFieldLabel htmlFor="community-profile-name" label="Community name" required />
            <Input
              id="community-profile-name"
              maxlength={80}
              onInput={(event) => update({ display_name: event.currentTarget.value })}
              placeholder="Community name"
              required
              size="lg"
              value={props.draft.display_name}
            />
            <FormNote>{props.draft.display_name.length}/80 characters</FormNote>
          </div>

          <div class="space-y-2">
            <FormFieldLabel htmlFor="community-profile-description" label="Description" />
            <Textarea
              id="community-profile-description"
              class="min-h-36 rounded-[var(--radius-2_5xl)] px-5 py-4"
              maxlength={500}
              onInput={(event) => update({ description: event.currentTarget.value })}
              placeholder="What brings this community together?"
              value={props.draft.description}
            />
            <FormNote>{props.draft.description.length}/500 characters</FormNote>
          </div>

          <div class="space-y-2">
            <FormFieldLabel htmlFor="community-profile-avatar" label="Avatar URL" />
            <Input
              id="community-profile-avatar"
              onInput={(event) => update({ avatar_url: event.currentTarget.value.trim() || null })}
              placeholder="https://…"
              type="url"
              value={props.draft.avatar_url ?? ""}
            />
            <FormNote>Storybook uses a URL field until the media-picker port is defined.</FormNote>
          </div>
        </div>
      </div>

      <CommunityModerationSaveFooter
        disabled={props.saveDisabled || props.draft.display_name.trim().length === 0}
        loading={props.saveLoading}
        onSave={props.onSave}
      />
    </section>
  );
}

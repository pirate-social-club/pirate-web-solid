import { Type } from "@pirate/web-solid-ui";
import { Show } from "solid-js";
import { CommunityModerationSaveFooter } from "../community-moderation-save-footer";
import { CommunityProfileForm } from "./community-profile-form";
import type { CommunityProfileDraft } from "./owner-settings-model";

export interface CommunityProfileSettingsPanelProps {
  draft: CommunityProfileDraft;
  onAvatarChange: (file: File | null) => void;
  onChange: (draft: CommunityProfileDraft) => void;
  onCoverChange: (file: File | null) => void;
  onSave: () => void;
  saveDisabled?: boolean;
  showHeading?: boolean;
  saveLoading?: boolean;
}

export function CommunityProfileSettingsPanel(props: CommunityProfileSettingsPanelProps) {
  return (
    <section class="mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8" data-community-profile-settings>
      <Show when={props.showHeading !== false}><div class="space-y-2">
        <Type as="h2" responsiveSize="desktop4xl" variant="h1">Profile</Type>
        <Type as="p" class="max-w-2xl text-muted-foreground" variant="body">
          Control how this community appears in discovery, feeds and invitations.
        </Type>
      </div></Show>

      <div class="rounded-[var(--radius-2_5xl)] border border-border-soft bg-card p-5 md:p-6">
        <CommunityProfileForm
          avatarSrc={props.draft.avatar_url}
          coverSrc={props.draft.cover_url}
          onAvatarChange={props.onAvatarChange}
          onChange={(value) => props.onChange({
            ...props.draft,
            description: value.description,
            display_name: value.displayName,
          })}
          onCoverChange={props.onCoverChange}
          value={{ description: props.draft.description, displayName: props.draft.display_name }}
        />
      </div>

      <CommunityModerationSaveFooter
        disabled={props.saveDisabled || props.draft.display_name.trim().length === 0}
        loading={props.saveLoading}
        onSave={props.onSave}
      />
    </section>
  );
}

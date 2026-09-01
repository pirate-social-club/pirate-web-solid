import {
  FormFieldLabel,
  FormNote,
  Input,
  MediaUploadField,
  Textarea,
} from "@pirate/web-solid-ui";

export interface CommunityProfileFormValue {
  description: string;
  displayName: string;
}

export interface CommunityProfileFormProps {
  avatarSrc?: string | null;
  coverSrc?: string | null;
  onAvatarChange: (file: File | null) => void;
  onChange: (value: CommunityProfileFormValue) => void;
  onCoverChange: (file: File | null) => void;
  value: CommunityProfileFormValue;
}

function initialsOf(name: string): string {
  const chunks = name.trim().split(/\s+/u).filter(Boolean);
  if (chunks.length === 0) return "";
  if (chunks.length === 1) return chunks[0]!.slice(0, 2).toUpperCase();
  return `${chunks[0]![0] ?? ""}${chunks[1]![0] ?? ""}`.toUpperCase();
}

export function CommunityProfileForm(props: CommunityProfileFormProps) {
  const update = (patch: Partial<CommunityProfileFormValue>) => props.onChange({ ...props.value, ...patch });

  return (
    <div class="space-y-6">
      <MediaUploadField
        chooseLabel="Add cover photo"
        clearLabel="Remove cover photo"
        description="A wide image works best."
        frame="banner"
        label="Cover photo"
        onChange={props.onCoverChange}
        onClear={() => props.onCoverChange(null)}
        previewSrc={props.coverSrc}
        replaceLabel="Change cover photo"
      />

      <MediaUploadField
        chooseLabel="Add avatar"
        clearLabel="Remove avatar"
        fallbackLabel={initialsOf(props.value.displayName)}
        frame="circle"
        label="Community avatar"
        onChange={props.onAvatarChange}
        onClear={() => props.onAvatarChange(null)}
        previewSrc={props.avatarSrc}
        replaceLabel="Change avatar"
      />

      <div class="space-y-2">
        <FormFieldLabel htmlFor="community-profile-name" label="Community name" required />
        <Input
          id="community-profile-name"
          maxlength={80}
          onInput={(event) => update({ displayName: event.currentTarget.value })}
          placeholder="Community name"
          required
          size="lg"
          value={props.value.displayName}
        />
        <FormNote>{props.value.displayName.length}/80 characters</FormNote>
      </div>

      <div class="space-y-2">
        <FormFieldLabel htmlFor="community-profile-description" label="Description" />
        <Textarea
          class="min-h-36 rounded-[var(--radius-2_5xl)] px-5 py-4"
          id="community-profile-description"
          maxlength={500}
          onInput={(event) => update({ description: event.currentTarget.value })}
          placeholder="What brings this community together?"
          value={props.value.description}
        />
        <FormNote>{props.value.description.length}/500 characters</FormNote>
      </div>
    </div>
  );
}

import { Input, Textarea, Type } from "../../../design-system";

export function PostComposerBasicFields(props: {
  description: string;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  idPrefix: string;
  onDescriptionChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  title: string;
  titlePlaceholder?: string;
}) {
  const titleId = `${props.idPrefix}-title`;
  const descriptionId = `${props.idPrefix}-description`;

  return (
    <>
      <div class="space-y-2">
        <label for={titleId}>
          <Type as="span" variant="caption">Title</Type>
        </label>
        <Input
          aria-label="Title"
          class="h-12 rounded-[var(--radius-xl)] bg-card px-3.5 text-base"
          id={titleId}
          maxlength={300}
          onChange={(event) => props.onTitleChange(event.currentTarget.value)}
          placeholder={props.titlePlaceholder}
          value={props.title}
        />
      </div>
      <div class="space-y-2">
        <label for={descriptionId}>
          <Type as="span" variant="caption">{props.descriptionLabel ?? "Description"}</Type>
        </label>
        <div class="relative">
          <Textarea
            aria-label={props.descriptionLabel ?? "Description"}
            class="min-h-[200px] resize-none rounded-[var(--radius-xl)] bg-card px-3.5 pb-10 pt-3.5 text-base leading-6"
            id={descriptionId}
            maxlength={500}
            onChange={(event) => props.onDescriptionChange(event.currentTarget.value)}
            placeholder={props.descriptionPlaceholder}
            value={props.description}
          />
          <Type as="span" class="pointer-events-none absolute bottom-3 start-3.5 text-xs text-muted-foreground" variant="caption">
            {`${props.description.length} / 500`}
          </Type>
        </div>
      </div>
    </>
  );
}

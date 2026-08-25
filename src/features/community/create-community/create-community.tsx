import { For, Show, createSignal } from "solid-js";

import {
  Avatar,
  Button,
  CheckboxCard,
  FormFieldLabel,
  FormNote,
  IconHandPalm,
  IconImage,
  IconPlus,
  Input,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Textarea,
  Type,
  cn,
} from "@pirate/web-solid-ui";
import {
  GATE_CATALOG,
  createCommunityCopy,
  gateKindsOf,
  validateDraft,
  type CreateCommunityDraft,
  type GateKind,
} from "./create-community-model";

export interface CreateCommunityFormProps {
  draft: CreateCommunityDraft;
  nameError?: string | null;
  avatarSrc?: string | null;
  coverSrc?: string | null;
  onAvatarChange?: (file: File | null) => void;
  onCoverChange?: (file: File | null) => void;
  onDraftChange?: (patch: Partial<CreateCommunityDraft>) => void;
  onGatesChange?: (kinds: GateKind[]) => void;
  layout?: "stacked" | "wide";
}

export function CreateCommunityForm(props: CreateCommunityFormProps) {
  const [addingGate, setAddingGate] = createSignal(false);
  const [nameTouched, setNameTouched] = createSignal(false);
  const selectedKinds = () => gateKindsOf(props.draft.policy);
  const selectedSet = () => new Set(selectedKinds());
  const availableGates = () => GATE_CATALOG.filter((gate) => !selectedSet().has(gate.kind));
  const description = () => props.draft.description ?? "";
  const validation = () => validateDraft(props.draft);
  const visibleNameError = () => props.nameError ?? (nameTouched() ? validation().nameError : null);

  const toggleGate = (kind: GateKind) => {
    const next = selectedSet().has(kind)
      ? selectedKinds().filter((selected) => selected !== kind)
      : [...selectedKinds(), kind];
    props.onGatesChange?.(next);
  };

  return (
    <div
      class={cn(
        "flex flex-col gap-5",
        props.layout === "wide" && "sm:grid sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-start sm:gap-x-6 sm:gap-y-5",
      )}
    >
      <div class={cn("flex flex-col gap-4", props.layout === "wide" && "sm:row-span-3")} data-community-images>
        <div>
          <input
            accept="image/*"
            aria-label={createCommunityCopy.coverLabel}
            class="sr-only"
            id="create-community-cover"
            onChange={(event) => {
              props.onCoverChange?.(event.currentTarget.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
            type="file"
          />
          <label
            class="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-lg)] border border-border-soft bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            for="create-community-cover"
          >
            <Show
              when={props.coverSrc}
              fallback={<><IconImage class="size-5" /><Type as="span" variant="caption">{createCommunityCopy.coverLabel}</Type></>}
            >
              {(src) => <img alt="" class="size-full object-cover" src={src()} />}
            </Show>
          </label>
        </div>

        <div class="flex flex-col gap-2">
          <FormFieldLabel htmlFor="create-community-avatar" label={createCommunityCopy.avatarLabel} />
          <div class="flex items-center gap-3">
            <Avatar
              class="size-[4.5rem] border-0 bg-card text-lg"
              fallback={props.draft.name || createCommunityCopy.title}
              src={props.avatarSrc ?? undefined}
            />
            <input
              accept="image/*"
              aria-label={createCommunityCopy.chooseImage}
              class="sr-only"
              id="create-community-avatar"
              onChange={(event) => {
                props.onAvatarChange?.(event.currentTarget.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
              type="file"
            />
            <label
              class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border-soft px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
              for="create-community-avatar"
            >
              <IconImage class="size-4" />
              {createCommunityCopy.chooseImage}
            </label>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <FormFieldLabel htmlFor="create-community-name" label={createCommunityCopy.nameLabel} />
        <Input
          aria-required="true"
          class="h-10 rounded-[var(--radius-lg)] bg-card px-3 py-2"
          id="create-community-name"
          onBlur={() => setNameTouched(true)}
          onInput={(event) => {
            setNameTouched(true);
            props.onDraftChange?.({ name: event.currentTarget.value });
          }}
          placeholder={createCommunityCopy.namePlaceholder}
          value={props.draft.name}
        />
        <Show when={visibleNameError()}>
          <div role="alert">
            <FormNote tone="warning">{visibleNameError()}</FormNote>
          </div>
        </Show>
      </div>

      <div class="flex flex-col gap-2">
        <FormFieldLabel htmlFor="create-community-description" label={createCommunityCopy.descriptionLabel} />
        <Textarea
          class="h-20 min-h-20 resize-none rounded-[var(--radius-lg)] bg-card px-3 py-2"
          id="create-community-description"
          onInput={(event) => props.onDraftChange?.({ description: event.currentTarget.value === "" ? null : event.currentTarget.value })}
          placeholder={createCommunityCopy.descriptionPlaceholder}
          rows={3}
          value={description()}
        />
      </div>

      <div class="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border-soft bg-background p-2" data-community-gates>
        <Type as="h2" class="px-1 pt-1" variant="body-strong">{createCommunityCopy.gatesTitle}</Type>
        <Show when={selectedKinds().length > 0}>
          <ul aria-label={createCommunityCopy.selectedGatesLabel} class="flex flex-col gap-2">
            <For each={selectedKinds()}>
              {(kind) => {
                const entry = () => GATE_CATALOG.find((gate) => gate.kind === kind);
                return (
                  <li class="flex min-h-16 items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-card px-3 py-2" data-selected-gate={kind}>
                    <span aria-hidden="true" class="text-lg leading-none text-muted-foreground">⠿</span>
                    <Show when={kind === "human-verification"}>
                      <IconHandPalm class="size-6" />
                    </Show>
                    <Type as="div" class="min-w-0 flex-1" variant="body-strong">{entry()?.label}</Type>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>

        <Button class="h-10 w-full" id="create-community-add-gate" onClick={() => setAddingGate((open) => !open)} variant="outline">
          <IconPlus class="size-4" />
          {addingGate() ? createCommunityCopy.closeGatePicker : createCommunityCopy.addGate}
        </Button>

        <Show when={addingGate()}>
          <div class="flex flex-col gap-2 pt-1" data-gate-picker>
            <For each={availableGates()}>
              {(gate) => (
                <CheckboxCard
                  checked={selectedSet().has(gate.kind)}
                  description={gate.description}
                  onCheckedChange={() => toggleGate(gate.kind)}
                  title={gate.label}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

export interface CreateCommunityProps {
  class?: string;
  draft: CreateCommunityDraft;
  nameError?: string | null;
  onDraftChange?: (patch: Partial<CreateCommunityDraft>) => void;
  onGatesChange?: (kinds: GateKind[]) => void;
  avatarSrc?: string | null;
  coverSrc?: string | null;
  onAvatarChange?: (file: File | null) => void;
  onCoverChange?: (file: File | null) => void;
  onSubmit?: () => void;
  submitting?: boolean;
}

export function CreateCommunityView(props: CreateCommunityProps) {
  const canSubmit = () => validateDraft(props.draft).valid && !props.submitting;

  return (
    <section class={cn("mx-auto flex w-full max-w-2xl flex-col gap-6", props.class)} data-create-community>
      <header class="space-y-2">
        <Type as="h1" variant="h1">{createCommunityCopy.title}</Type>
      </header>

      <CreateCommunityForm
        avatarSrc={props.avatarSrc}
        coverSrc={props.coverSrc}
        draft={props.draft}
        nameError={props.nameError}
        onAvatarChange={props.onAvatarChange}
        onCoverChange={props.onCoverChange}
        onDraftChange={props.onDraftChange}
        onGatesChange={props.onGatesChange}
      />

      <footer class="sticky bottom-0 z-10 bg-background py-4" data-create-community-footer>
        <Button class="h-14 w-full" disabled={!canSubmit()} loading={props.submitting} onClick={props.onSubmit}>
          {createCommunityCopy.submit}
        </Button>
      </footer>
    </section>
  );
}

export interface CreateCommunityModalProps {
  draft: CreateCommunityDraft;
  forceMobile?: boolean;
  nameError?: string | null;
  avatarSrc?: string | null;
  coverSrc?: string | null;
  onAvatarChange?: (file: File | null) => void;
  onCoverChange?: (file: File | null) => void;
  onDraftChange?: (patch: Partial<CreateCommunityDraft>) => void;
  onGatesChange?: (kinds: GateKind[]) => void;
  onOpenChange?: (open: boolean) => void;
  onSubmit?: () => void;
  open: boolean;
  submitting?: boolean;
}

export function CreateCommunityModal(props: CreateCommunityModalProps) {
  const canSubmit = () => validateDraft(props.draft).valid && !props.submitting;

  return (
    <Modal forceMobile={props.forceMobile} onOpenChange={props.onOpenChange} open={props.open}>
      <ModalContent
        class="h-dvh max-h-dvh w-screen max-w-none gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:h-[min(90dvh,36rem)] sm:max-h-[90dvh] sm:w-full sm:max-w-4xl sm:rounded-[var(--radius-xl)] sm:border"
        mobileSide="bottom"
      >
        <div class="flex h-full min-h-0 flex-col">
          <ModalHeader class="flex h-16 shrink-0 justify-center border-b border-border-soft px-5 pe-14 text-start sm:h-auto sm:px-8 sm:pb-5 sm:pt-8">
            <ModalTitle leading="tight" variant="h3">{createCommunityCopy.title}</ModalTitle>
          </ModalHeader>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-8 sm:py-6" data-create-community-scroll>
            <CreateCommunityForm
              avatarSrc={props.avatarSrc}
              coverSrc={props.coverSrc}
              draft={props.draft}
              layout="wide"
              nameError={props.nameError}
              onAvatarChange={props.onAvatarChange}
              onCoverChange={props.onCoverChange}
              onDraftChange={props.onDraftChange}
              onGatesChange={props.onGatesChange}
            />
          </div>

          <ModalFooter class="mt-0 shrink-0 border-t border-border-soft bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pb-8">
            <Button class="h-11 w-full" disabled={!canSubmit()} loading={props.submitting} onClick={props.onSubmit}>
              {createCommunityCopy.submit}
            </Button>
          </ModalFooter>
        </div>
      </ModalContent>
    </Modal>
  );
}

export const CreateCommunity = CreateCommunityView;

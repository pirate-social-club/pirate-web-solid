import type { JSX } from "@solidjs/web";

export interface EditProfileFormValues {
  displayName: string;
  bio: string;
}

export interface EditProfileFieldError {
  field: "displayName" | "bio";
  message: string;
}

type EditProfileSubmitState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "success" };

export type HandleRenameState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; freeRenameRemaining?: boolean }
  | { kind: "unavailable"; reason: string }
  | { kind: "invalid"; reason: string }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "success"; newHandle: string };

export interface EditProfileHandleFlow {
  draft: string;
  preview?: string;
  state: HandleRenameState;
  onDraftChange?: (value: string) => void;
  onCheckAvailability?: () => void;
  onSubmitRename?: () => void | Promise<void>;
  onResetState?: () => void;
}

export interface EditProfileFormProps {
  class?: string;
  currentAvatarSeed?: string;
  currentAvatarSrc?: string;
  currentBio?: string;
  currentDisplayName: string;
  currentHandle?: string;
  fieldErrors?: EditProfileFieldError[];
  handleFlow?: EditProfileHandleFlow;
  onChange?: (values: EditProfileFormValues) => void;
  onSubmit?: (values: EditProfileFormValues) => void;
  submitState?: EditProfileSubmitState;
  values: EditProfileFormValues;
  fieldIdPrefix?: string;
}

export interface EditProfileDialogProps extends EditProfileFormProps {
  children: JSX.Element;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

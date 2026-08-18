import type {
  EditProfileFieldError,
  EditProfileFormValues,
} from "./edit-profile-form.types";

const DISPLAY_NAME_LIMIT = 50;
const BIO_LIMIT = 300;

export function trimDisplayName(value: string): string {
  return value.trim();
}

export function isEditProfileDirty(
  values: EditProfileFormValues,
  currentDisplayName: string,
  currentBio = "",
): boolean {
  return trimDisplayName(values.displayName) !== trimDisplayName(currentDisplayName) || values.bio !== currentBio;
}

export function editProfileValidation(
  values: EditProfileFormValues,
  fieldErrors: EditProfileFieldError[] = [],
): EditProfileFieldError[] {
  const errors = [...fieldErrors];
  if (!values.displayName.trim() && !errors.some((error) => error.field === "displayName")) {
    errors.push({ field: "displayName", message: "Display name is required." });
  }
  if (values.displayName.length > DISPLAY_NAME_LIMIT && !errors.some((error) => error.field === "displayName")) {
    errors.push({ field: "displayName", message: `Display name must be ${DISPLAY_NAME_LIMIT} characters or fewer.` });
  }
  if (values.bio.length > BIO_LIMIT && !errors.some((error) => error.field === "bio")) {
    errors.push({ field: "bio", message: `Bio must be ${BIO_LIMIT} characters or fewer.` });
  }
  return errors;
}

export function canSubmitEditProfile(
  values: EditProfileFormValues,
  currentDisplayName: string,
  currentBio: string,
  submitKind: "idle" | "saving" | "error" | "success" = "idle",
  fieldErrors: EditProfileFieldError[] = [],
): boolean {
  return isEditProfileDirty(values, currentDisplayName, currentBio)
    && submitKind !== "saving"
    && editProfileValidation(values, fieldErrors).length === 0;
}

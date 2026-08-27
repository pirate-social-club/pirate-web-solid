/**
 * Shared option fixture for Select and Combobox stories: three entries, the
 * last one disabled, with the accessors both components expect.
 */
export interface DemoOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export const sortOptions: DemoOption[] = [
  { value: "new", label: "Newest" },
  { value: "top", label: "Top rated" },
  { value: "old", label: "Oldest", disabled: true },
];

export const optionValue = (option: DemoOption) => option.value;
export const optionLabel = (option: DemoOption) => option.label;
export const optionDisabled = (option: DemoOption) => option.disabled ?? false;

/** Shared mascot image fixture for stories; it uses the production asset contract. */
export const demoAvatarImage = "/mascots/error-ghost-256.png";

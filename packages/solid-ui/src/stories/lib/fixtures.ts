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

/** Deterministic local avatar image (data URI); no network dependency. */
export const demoAvatarImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%234f46e5'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23fde68a'/%3E%3Cpath d='M18 92c5-20 16-30 32-30s27 10 32 30z' fill='%23fde68a'/%3E%3C/svg%3E";

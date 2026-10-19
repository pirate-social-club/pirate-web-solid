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

/**
 * Mascot image fixture for avatar stories. Like the artwork below, it is an
 * owned asset in public/storybook, so it loads in both catalogs.
 */
export const demoAvatarImage = "/storybook/avatar-ghost.svg";

/**
 * Artwork stand-in that loads in the app catalog (and so in CI's storybook
 * audit): an owned image asset served from the app's public/storybook folder.
 * Hand-authored SVG is not allowed in source (check:phosphor-icons).
 */
export const demoArtworkImage = "/storybook/karaoke-artwork.svg";

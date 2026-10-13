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

/**
 * Artwork stand-in that always loads: an inline gradient SVG, so image
 * variants render a real image in both catalogs without a static asset
 * directory. Paper draws image tiles with a gradient stand-in too.
 */
export const demoArtworkImage = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d4f8f"/><stop offset="1" stop-color="#2f2748"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/></svg>',
)}`;

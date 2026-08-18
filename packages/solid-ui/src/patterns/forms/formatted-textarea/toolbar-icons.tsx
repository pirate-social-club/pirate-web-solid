interface IconProps {
  class?: string;
}

/**
 * Local Batch 4 toolbar icons. Kept inside this pattern's directory because
 * `src/components/media/icons.tsx` is a shared file that requires lane
 * coordination; the proposed shared-file edit (promote these to icons.tsx) is
 * recorded in DESIGN-SYSTEM.md.
 */
export function IconQuote(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M10 11H6.5a2.5 2.5 0 0 0 0 5H9a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2H6a4 4 0 0 1-4-4V10a6 6 0 0 1 6-6h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1Zm11 0h-3.5a2.5 2.5 0 0 0 0 5H20a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2h-2a4 4 0 0 1-4-4V10a6 6 0 0 1 6-6h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1Z" />
    </svg>
  );
}

export function IconLinkSimple(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M9 15l6-6" />
      <path d="M11 6l1.5-1.5a3.54 3.54 0 0 1 5 0l1 1a3.54 3.54 0 0 1 0 5L17 12a3.54 3.54 0 0 1-5 0" />
      <path d="M13 18l-1.5 1.5a3.54 3.54 0 0 1-5 0l-1-1a3.54 3.54 0 0 1 0-5L7 12a3.54 3.54 0 0 1 5 0" />
    </svg>
  );
}

export function IconListBullets(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="5" cy="6" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="5" cy="18" r="1" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

export function IconListNumbers(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 6V5a1 1 0 0 1 2 0v1h-2m2 4H4m2 0a2 2 0 1 1-2 2" />
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 18v-1a1 1 0 0 1 2 0v1h-2m2 2H4m2 0a1 1 0 0 1-1 1h-1" />
    </svg>
  );
}

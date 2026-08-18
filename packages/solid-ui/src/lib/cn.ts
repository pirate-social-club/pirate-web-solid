import { twMerge } from "tailwind-merge";

type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean | undefined>
  | ClassValue[];

function toClassString(input: ClassValue): string {
  if (input === null || input === undefined || input === false) return "";
  if (typeof input === "string" || typeof input === "number") return String(input);
  if (typeof input === "boolean") return "";
  if (Array.isArray(input)) return input.map(toClassString).join(" ");
  return Object.entries(input)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(" ");
}

/**
 * Framework-agnostic classname combiner: joins class fragments and resolves
 * Tailwind conflicts. Mirrors web's `cn()` (clsx + tailwind-merge) without the
 * clsx dependency.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(inputs.map(toClassString).join(" "));
}

import { createContext, useContext, type Accessor } from "solid-js";

/** Private route-local selection; changing it cancels and rereads the target. */
export const TargetedPersonaContext = createContext<{
  readonly selected: Accessor<string | undefined>;
  readonly select: (id: string) => void;
  readonly refuse: (kind: "age" | "missing" | "unavailable") => void;
} | null>(null);
export function useTargetedPersona() { return useContext(TargetedPersonaContext); }

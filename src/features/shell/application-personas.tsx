import { createContext, createEffect, createMemo, createSignal, onCleanup, untrack, useContext, type Accessor } from "solid-js";
import { resolveSession, type SessionResolution } from "../../api/session.ts";
import type { SwitchablePersona } from "../identity/persona-switcher-sheet/persona-switcher-sheet.tsx";
import type { ApplicationSessionState } from "./application-session.tsx";

export interface ApplicationPersonas {
  personas: Accessor<readonly SwitchablePersona[]>;
  selected: Accessor<SwitchablePersona | undefined>;
  loading: Accessor<boolean>;
  unavailable: Accessor<boolean>;
  pickerOpen: Accessor<boolean>;
  setPickerOpen: (open: boolean) => void;
  select: (personaId: string) => void;
  retry: () => void;
}

/** Private navigation preference only; operation controllers retain their own authority checks. */
export function createApplicationPersonas(
  account: Accessor<ApplicationSessionState>,
  load: () => Promise<SessionResolution> = resolveSession,
): ApplicationPersonas {
  const [personas, setPersonas] = createSignal<readonly SwitchablePersona[]>([]);
  const [selectedId, setSelectedId] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);
  const [unavailable, setUnavailable] = createSignal(false);
  const [pickerOpen, setPickerOpen] = createSignal(false);
  let owner: string | undefined;
  let epoch = 0;
  let active = true;
  const selected = createMemo(() => personas().find(persona => persona.personaId === selectedId()));

  const update = (current = untrack(account)) => {
    const userId = typeof current === "object" ? current.userId : undefined;
    const request = ++epoch;
    if (owner !== userId) {
      setPersonas([]);
      setSelectedId(undefined);
      setPickerOpen(false);
      owner = userId;
    }
    setUnavailable(false);
    setLoading(userId !== undefined);
    if (userId === undefined) {
      if (current === "anonymous") setPickerOpen(false);
      return;
    }
    void load().then(result => {
      if (!active || epoch !== request) return;
      if (result === "anonymous" || result.userId !== userId || result.personasUnavailable) {
        setUnavailable(true);
        return;
      }
      const next = result.personas.map(persona => ({
        personaId: persona.personaId,
        displayName: persona.displayName ?? persona.primaryPublicHandle ?? "Profile",
        publicHandle: persona.primaryPublicHandle,
        avatarSrc: persona.avatarRef,
        avatarSeed: persona.displayName ?? persona.primaryPublicHandle ?? "Profile",
      }));
      setPersonas(next);
      if (!next.some(persona => persona.personaId === selectedId())) {
        setSelectedId(next.find(persona => persona.publicHandle?.endsWith(".pirate"))?.personaId ?? next[0]?.personaId);
      }
    }).catch(() => {
      if (active && epoch === request) setUnavailable(true);
    }).finally(() => {
      if (active && epoch === request) setLoading(false);
    });
  };
  createEffect(account, update);
  onCleanup(() => { active = false; epoch++; });
  return {
    personas, selected, loading, unavailable, pickerOpen, setPickerOpen,
    select: personaId => {
      if (!personas().some(persona => persona.personaId === personaId)) return;
      setSelectedId(personaId);
      setPickerOpen(false);
    },
    retry: () => update(),
  };
}

export const ApplicationPersonasContext = createContext<ApplicationPersonas>();
export const useApplicationPersonas = () => useContext(ApplicationPersonasContext);

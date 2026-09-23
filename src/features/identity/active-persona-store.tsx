/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { createContext, createSignal, useContext, type Accessor } from "solid-js";

import type { SwitchablePersona } from "./persona-switcher-sheet/persona-switcher-sheet.tsx";

/**
 * The app's single owner of "which profile is acting in this community".
 *
 * The community page registers the switch target while it is mounted: the
 * eligible personas and the community they belong to. The shell's profile
 * control opens the switcher against that target, and every writer goes
 * through `selectPersona`, so a selection made from the footer, the page, or
 * any future surface lands in one place. A retained submission bound to
 * another persona is never rewritten here; the composer resolves that case
 * against the draft it restored.
 */
export interface PersonaSwitchTarget {
  readonly communityId: string;
  readonly personas: readonly SwitchablePersona[];
  readonly title?: string;
}

export interface ActivePersonaStore {
  activePersonaId: (communityId: string) => string | undefined;
  selectPersona: (communityId: string, personaId: string | undefined) => void;
  setTarget: (target: PersonaSwitchTarget | undefined) => void;
  target: Accessor<PersonaSwitchTarget | undefined>;
  open: Accessor<boolean>;
  openSwitcher: () => void;
  closeSwitcher: () => void;
}

function createActivePersonaStore(): ActivePersonaStore {
  // Pages register their target from an effect and composers select from
  // theirs, so these app-scoped signals are written from owned scopes by design.
  const [selections, setSelections] = createSignal<Readonly<Record<string, string>>>({}, { ownedWrite: true });
  const [target, setTarget] = createSignal<PersonaSwitchTarget | undefined>(undefined, { ownedWrite: true });
  const [open, setOpen] = createSignal(false, { ownedWrite: true });

  const activePersonaId = (communityId: string) => selections()[communityId];

  const selectPersona = (communityId: string, personaId: string | undefined) => {
    setSelections((current) => {
      if (personaId === undefined || personaId === "") {
        if (!(communityId in current)) return current;
        const next = { ...current };
        delete next[communityId];
        return next;
      }
      if (current[communityId] === personaId) return current;
      return { ...current, [communityId]: personaId };
    });
  };

  return {
    activePersonaId,
    selectPersona,
    // The target only exists while a page that owns an active persona is
    // mounted. Registering a new one replaces the old, and unregistering hides
    // the gesture so the shell cannot open a switcher with no audience.
    setTarget: (next) => {
      setTarget(() => next);
      if (next === undefined) setOpen(false);
    },
    target,
    open,
    openSwitcher: () => {
      const current = target();
      if (current === undefined || current.personas.length < 2) return;
      setOpen(true);
    },
    closeSwitcher: () => setOpen(false),
  };
}

const ActivePersonaContext = createContext<ActivePersonaStore | null>(null);

export function ActivePersonaProvider(props: {
  readonly children: JSX.Element;
}) {
  const store = createActivePersonaStore();
  return <ActivePersonaContext value={store}>{props.children}</ActivePersonaContext>;
}

export function useActivePersonaStore(): ActivePersonaStore {
  const store = useContext(ActivePersonaContext);
  if (store === null) throw new Error("ActivePersonaProvider is missing");
  return store;
}

/**
 * Optional read for surfaces that render in isolation (unit tests, stories):
 * without a provider the page keeps its own local selection.
 */
export function useActivePersonaStoreOptional(): ActivePersonaStore | undefined {
  return useContext(ActivePersonaContext) ?? undefined;
}

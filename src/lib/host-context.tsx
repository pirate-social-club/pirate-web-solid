import { getRequestEvent } from "@solidjs/web";
import { createContext, useContext, type ParentProps } from "solid-js";

export type HostSurface = "canonical" | "sovereign-app" | "sovereign-apex";

export interface HostContext {
  surface: HostSurface;
  communitySlug: string | null;
  importedRoot: boolean;
  forwardingMetadataPresent: boolean;
}

const defaultHostContext: HostContext = {
  surface: "canonical",
  communitySlug: null,
  importedRoot: false,
  forwardingMetadataPresent: false,
};

declare module "@solidjs/web" {
  interface RequestEventLocals {
    hostContext?: HostContext;
    cspNonce?: string;
    bindingResult?: string;
    routeStatus?: number;
    seamHost?: HostSurface;
    apiOrigin?: string;
    apiFeedResult?: { ok: boolean; itemCount: number };
  }
}

export const HostContextContext = createContext<HostContext>(defaultHostContext);

export function readHostContext(): HostContext {
  const serverContext = getRequestEvent()?.locals?.hostContext;
  if (serverContext) return serverContext;

  if (typeof document !== "undefined") {
    const root = document.documentElement.dataset;
    const surface = root.hostSurface;
    return {
      surface: surface === "sovereign-app" || surface === "sovereign-apex" ? surface : "canonical",
      communitySlug: root.communitySlug || null,
      importedRoot: root.importedRoot === "1",
      forwardingMetadataPresent: root.forwardingMetadata === "1",
    };
  }

  return defaultHostContext;
}

export function HostContextProvider(props: ParentProps<{ value: HostContext }>) {
  return <HostContextContext value={props.value}>{props.children}</HostContextContext>;
}

export function useHostContext(): HostContext {
  return useContext(HostContextContext);
}

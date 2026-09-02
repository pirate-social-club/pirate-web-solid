import { createContext, useContext, type Accessor } from "solid-js";
import type { JSX } from "@solidjs/web";

import type { AccountSessionResolution } from "../../api/session.ts";

export type ApplicationSessionState = "resolving" | AccountSessionResolution;
export type ApplicationSessionAccessor = Accessor<ApplicationSessionState | undefined>;

const ApplicationSessionContext = createContext<ApplicationSessionAccessor>(() => undefined);

export function ApplicationSessionProvider(props: {
  readonly children: JSX.Element;
  readonly state: Accessor<ApplicationSessionState>;
}) {
  return <ApplicationSessionContext value={props.state}>{props.children}</ApplicationSessionContext>;
}

export function useApplicationSession(): ApplicationSessionAccessor {
  return useContext(ApplicationSessionContext);
}

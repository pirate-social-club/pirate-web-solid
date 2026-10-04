import { createContext, useContext, type Accessor } from "solid-js";
import type { JSX } from "@solidjs/web";

import type { AccountSessionResolution, SessionResolution } from "../../api/session.ts";

/**
 * The chrome accepts both the account-only resolution and the full session
 * with personas; the full shape is what lets the shell link to the viewer's
 * own public profile.
 */
export type ApplicationSessionState = "resolving" | "failed" | AccountSessionResolution | SessionResolution;
export type ApplicationSessionAccessor = Accessor<ApplicationSessionState | undefined>;

const ApplicationSessionPendingContext = createContext<Accessor<boolean>>(() => false);

const ApplicationSessionContext = createContext<ApplicationSessionAccessor>(() => undefined);

export function ApplicationSessionProvider(props: {
  readonly children: JSX.Element;
  readonly state: Accessor<ApplicationSessionState>;
  /** The shell may retain its authenticated chrome while a new check runs. */
  readonly pending?: Accessor<boolean>;
}) {
  return <ApplicationSessionPendingContext value={props.pending ?? (() => false)}>
    <ApplicationSessionContext value={props.state}>{props.children}</ApplicationSessionContext>
  </ApplicationSessionPendingContext>;
}

export function useApplicationSession(): ApplicationSessionAccessor {
  return useContext(ApplicationSessionContext);
}

export function useApplicationSessionPending(): Accessor<boolean> {
  return useContext(ApplicationSessionPendingContext);
}

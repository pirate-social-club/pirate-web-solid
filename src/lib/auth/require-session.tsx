import type { ParentProps } from "solid-js";
import { createPrivyAdapter } from "./privy";

/**
 * M1 route-boundary seam. M2 will replace the pass-through with the real Core
 * JS session check and redirect policy; route components should not call the
 * Privy adapter directly.
 */
export function RequireSession(props: ParentProps) {
  const adapter = createPrivyAdapter();
  void adapter;
  return (
    <div data-session-boundary="stub">
      {props.children}
    </div>
  );
}

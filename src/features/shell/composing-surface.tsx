/** @jsxImportSource @solidjs/web */
import { createContext, useContext, type Accessor } from "solid-js";

/**
 * Lets a page tell the application chrome that the viewer is writing a post.
 * On a phone, composing is the whole screen, so the chrome hides its bottom
 * navigation while this is true. The chrome owns the value and resets it when
 * the page that set it goes away.
 */
export interface ComposingSurface {
  readonly composing: Accessor<boolean>;
  readonly setComposing: (composing: boolean) => void;
}

export const ComposingSurfaceContext = createContext<ComposingSurface | null>(null);

export function useComposingSurface(): ComposingSurface | null {
  return useContext(ComposingSurfaceContext);
}

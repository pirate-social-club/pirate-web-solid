import { createContext, useContext, type Accessor } from "solid-js";

export const SIDEBAR_WIDTH = "22rem";
export const SIDEBAR_WIDTH_MOBILE = "min(20rem, calc(100vw - 3rem))";
export const SIDEBAR_WIDTH_MOBILE_VARIABLE = "--sidebar-width-mobile";
export const SIDEBAR_WIDTH_ICON = "4rem";
export const SIDEBAR_KEYBOARD_SHORTCUT = "b";

export interface SidebarContextValue {
  state: Accessor<"expanded" | "collapsed">;
  open: Accessor<boolean>;
  setOpen: (open: boolean) => void;
  openMobile: Accessor<boolean>;
  setOpenMobile: (open: boolean) => void;
  isMobile: Accessor<boolean>;
  toggleSidebar: () => void;
}

export const SidebarContext = createContext<SidebarContextValue>();
export const SidebarSideContext = createContext<"left" | "right">("left");

export function createSidebar(): SidebarContextValue {
  return useContext(SidebarContext);
}

export function createSidebarSide(): "left" | "right" {
  return useContext(SidebarSideContext);
}

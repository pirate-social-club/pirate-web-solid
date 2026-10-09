export const SESSION_REJECTED_EVENT = "pirate:session-rejected";

export function reportSessionRejection(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_REJECTED_EVENT));
}

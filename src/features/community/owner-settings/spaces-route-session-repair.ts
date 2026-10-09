import { resolveAccountSession } from "../../../api/session";
import { ensureApplicationSession } from "../../auth/session-recovery";

/**
 * Makes sure the owner's application session is usable before an address
 * request. Resolves false when the owner has to sign in again.
 */
export async function repairOwnerSession(accountId: string | undefined, signal: AbortSignal): Promise<boolean> {
  let owner = accountId;
  if (owner === undefined) {
    const account = await resolveAccountSession({ timeoutMs: 15_000 });
    if (account === "anonymous" || signal.aborted) return false;
    owner = account.userId;
  }
  if (signal.aborted) return false;
  return ensureApplicationSession(owner, signal);
}

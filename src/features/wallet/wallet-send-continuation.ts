/** Tab-private form hints only. Every return rereads the owned server record;
 * no signature, proof, session token or transfer authority is retained here. */
export type WalletSendDraft = Readonly<{
  accountId: string;
  personaId: string;
  walletAddress: string;
  recipient: string;
  amount: string;
  idempotencyKey: string;
  sendId: string | null;
}>;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const prefix = "pirate:wallet-send-return:v1:";
// Match the one-hour verification intent lifetime. This is a form-hint bound,
// never a substitute for current server evidence or reservation expiry.
const lifetime = 60 * 60_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
export function validWalletSendIdentifier(value: string): boolean {
  if (value.length === 0 || value.length > 200) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x21 || code === 0x7f || /\s/u.test(character)) return false;
  }
  return true;
}
const id = (value: unknown): value is string => typeof value === "string" && validWalletSendIdentifier(value);
const address = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/u.test(value);

function valid(value: unknown): value is WalletSendDraft {
  if (value === null || typeof value !== "object" || !("accountId" in value) || !("personaId" in value)
    || !("walletAddress" in value) || !("recipient" in value) || !("amount" in value)
    || !("idempotencyKey" in value) || !("sendId" in value)) return false;
  const keys = ["accountId", "personaId", "walletAddress", "recipient", "amount", "idempotencyKey", "sendId"];
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
    && id(value.accountId) && id(value.personaId) && address(value.walletAddress) && address(value.recipient)
    && typeof value.amount === "string" && value.amount.length <= 80 && /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/u.test(value.amount)
    && typeof value.idempotencyKey === "string" && uuid.test(value.idempotencyKey)
    && (value.sendId === null || id(value.sendId));
}

export function rememberWalletSend(draft: WalletSendDraft, storage: Storage = sessionStorage, now = Date.now()): string {
  if (!valid(draft)) throw new Error("wallet_send_return_invalid");
  storage.setItem(prefix + draft.idempotencyKey, JSON.stringify({ draft, at: now }));
  return `/verify/very?purpose=wallet_send&persona_id=${encodeURIComponent(draft.personaId)}&return_to=${encodeURIComponent(`/wallet?send_return=${draft.idempotencyKey}`)}`;
}

export function readWalletSend(key: string, accountId: string, storage: Storage = sessionStorage, now = Date.now()): WalletSendDraft | undefined {
  if (!uuid.test(key)) return undefined;
  const raw = storage.getItem(prefix + key);
  if (raw === null) return undefined;
  try {
    if (raw.length > 2000) throw new Error("oversized");
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || !("draft" in parsed) || !("at" in parsed)) throw new Error("invalid");
    const { draft, at } = parsed;
    if (!valid(draft) || draft.idempotencyKey !== key || draft.accountId !== accountId
      || typeof at !== "number" || !Number.isFinite(at) || now < at || now - at >= lifetime) throw new Error("invalid");
    return draft;
  } catch {
    storage.removeItem(prefix + key);
    return undefined;
  }
}

export function forgetWalletSend(key: string, storage: Storage = sessionStorage): void {
  if (uuid.test(key)) storage.removeItem(prefix + key);
}

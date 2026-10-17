import type { NamespaceSettingsSnapshot } from "./owner-settings-model";

export type HnsPublicationBinding = Readonly<{
  community_id: string;
  root_import_session_id: string;
  root_label: string;
  publish_plan_sha256: string;
}>;

export type HnsPublicationReceipt = HnsPublicationBinding & Readonly<{
  version: 1;
  txid: string | null;
}>;

const PREFIX = "pirate:hns-publication:v1:";
const SHA256 = /^[a-f0-9]{64}$/;

export function publicationBinding(snapshot: NamespaceSettingsSnapshot): HnsPublicationBinding | null {
  const session = snapshot.root_import_session_id;
  const digest = snapshot.publish_plan_sha256;
  if (!session || session.length > 256 || !digest || !SHA256.test(digest)
    || !snapshot.community_id || snapshot.community_id.length > 256
    || !snapshot.root_label || snapshot.root_label.length > 63) return null;
  return {
    community_id: snapshot.community_id,
    root_import_session_id: session,
    root_label: snapshot.root_label,
    publish_plan_sha256: digest,
  };
}

export function publicationStorageKey(binding: HnsPublicationBinding): string {
  // One fence per session: a changed plan must not silently permit a new send.
  return PREFIX + encodeURIComponent(binding.community_id) + ":" + encodeURIComponent(binding.root_import_session_id);
}

export function samePublication(left: HnsPublicationBinding, right: HnsPublicationBinding): boolean {
  return left.community_id === right.community_id && left.root_import_session_id === right.root_import_session_id
    && left.root_label === right.root_label && left.publish_plan_sha256 === right.publish_plan_sha256;
}

function isPublicationReceipt(value: unknown): value is HnsPublicationReceipt {
  if (typeof value !== "object" || value === null) return false;
  return "version" in value && value.version === 1
    && "community_id" in value && typeof value.community_id === "string" && value.community_id.length > 0 && value.community_id.length <= 256
    && "root_import_session_id" in value && typeof value.root_import_session_id === "string" && value.root_import_session_id.length > 0 && value.root_import_session_id.length <= 256
    && "root_label" in value && typeof value.root_label === "string" && value.root_label.length > 0 && value.root_label.length <= 63
    && "publish_plan_sha256" in value && typeof value.publish_plan_sha256 === "string" && SHA256.test(value.publish_plan_sha256)
    && "txid" in value && (value.txid === null || (typeof value.txid === "string" && SHA256.test(value.txid)));
}

export function readPublication(binding: HnsPublicationBinding): HnsPublicationReceipt | null {
  const raw = localStorage.getItem(publicationStorageKey(binding));
  if (raw === null) return null;
  if (raw.length > 2048) throw new Error("invalid_publication_receipt");
  const value: unknown = JSON.parse(raw);
  if (!isPublicationReceipt(value) || value.community_id !== binding.community_id
    || value.root_import_session_id !== binding.root_import_session_id) throw new Error("invalid_publication_receipt");
  return { version: 1, community_id: value.community_id, root_import_session_id: value.root_import_session_id,
    root_label: value.root_label, publish_plan_sha256: value.publish_plan_sha256, txid: value.txid };
}

export function savePublication(receipt: HnsPublicationReceipt): void {
  const key = publicationStorageKey(receipt);
  const raw = JSON.stringify(receipt);
  localStorage.setItem(key, raw);
  if (localStorage.getItem(key) !== raw) throw new Error("publication_receipt_not_saved");
}

/** A tab lock plus a durable, non-authentication fence, never cleared on error or timeout. */
export async function lockPublication(binding: HnsPublicationBinding, action: () => Promise<void>): Promise<void> {
  if (!globalThis.navigator?.locks) throw new Error("publication_lock_unavailable");
  await navigator.locks.request(publicationStorageKey(binding), { mode: "exclusive" }, action);
}

/**
 * Connecting an owned Spaces root as a community address. The owner signs one
 * message with their wallet; nothing is sent on chain and no key is handled here.
 */
export type SpacesRouteAttachmentStatus =
  | "awaiting_signature"
  | "proved"
  | "committed"
  | "expired"
  | "root_changed"
  | "signature_rejected"
  | "configuration_changed";

export interface SpacesRouteAttachmentState {
  status: SpacesRouteAttachmentStatus;
  attachment_intent_id: string;
  generation: number;
  purpose: "first_attachment" | "revalidation";
  canonical_root: string;
  public_origin: string;
  canonical_href: string;
  challenge_message: string;
  expires_at: string;
  route_binding_id: string | null;
  replayed: boolean;
}

export interface SpacesRouteAttachmentPending {
  status: "verification_pending";
  retry_after_seconds: number;
}

export type SpacesRouteAttachmentResult = SpacesRouteAttachmentState | SpacesRouteAttachmentPending;

export interface SpacesRouteAttachmentApi {
  start(input: { communityId: string; canonicalRoot: string; idempotencyKey: string }): Promise<SpacesRouteAttachmentResult>;
  /** The community's latest attempt, or null when it has never started one. */
  current(input: { communityId: string }): Promise<SpacesRouteAttachmentResult | null>;
  prove(input: { communityId: string; attachmentIntentId: string; signatureHex: string }): Promise<SpacesRouteAttachmentResult>;
  commit(input: { communityId: string; attachmentIntentId: string; generation: number }): Promise<SpacesRouteAttachmentResult>;
  /** Whether /c/@root reaches a community right now. A past success does not answer this. */
  resolves(input: { canonicalRoot: string }): Promise<boolean>;
}

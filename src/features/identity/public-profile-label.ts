import { sha256, toBytes } from "viem";
import type { UiLocaleCode } from "../../lib/ui-locale-core.ts";
import { getLocaleMessages, interpolateMessage } from "../../locales/index.ts";

export interface PublicProfileLabelSource {
  readonly persona_id: string;
  readonly primary_public_handle: string | null;
  readonly display_name: string | null;
}

/** A presentation fragment, not an allocated or guaranteed unique username.
 * Hash the whole public community profile id, never an account or wallet id.
 * Twelve base-32 characters retain 60 bits and render identically in SSR and
 * the browser. Profile navigation always uses the complete public id.
 */
export function publicProfileFragment(personaId: string): string {
  const digest = sha256(toBytes(`community-profile-label-v1\u0000${personaId}`));
  return BigInt(`0x${digest.slice(2, 17)}`).toString(32).padStart(12, "0").toUpperCase();
}

export function publicProfileLabel(
  persona: PublicProfileLabelSource | null | undefined,
  locale: UiLocaleCode = "en",
  legacyPublicHandle?: string | null,
): string {
  const handle = persona?.primary_public_handle?.trim() || legacyPublicHandle?.trim();
  if (handle) return handle;
  const displayName = persona?.display_name?.trim();
  if (displayName) return displayName;
  const copy = getLocaleMessages(locale, "routes").publicIdentity;
  if (!persona?.persona_id.trim()) return copy.unavailable;
  return interpolateMessage(copy.fallback, { suffix: publicProfileFragment(persona.persona_id) });
}

/** Only a public projection can supply this id; never derive it from label text. */
export function publicProfileHref(personaId: string | null | undefined): string | undefined {
  return personaId?.trim() ? `/p/${encodeURIComponent(personaId)}` : undefined;
}

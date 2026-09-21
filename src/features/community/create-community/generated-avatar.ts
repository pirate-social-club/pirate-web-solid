/**
 * The locally generated profile-avatar default of Spec 014 §3.1: a
 * deterministic image derived only from a random seed the owner may shuffle.
 * It is never derived from the Public name or the persona id, and no hosted
 * generator is involved. The image is an inline SVG data URI, so it renders
 * identically on the server and the client.
 */

export function randomAvatarSeed(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(state: number): () => number {
  let value = state;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A mirrored five-by-five identicon in one hue family, as an SVG data URI. */
export function generatedAvatarSrc(seed: string): string {
  const random = mulberry32(hashSeed(seed));
  const hue = Math.floor(random() * 360);
  const background = `hsl(${hue} 70% 88%)`;
  const foreground = `hsl(${hue} 60% 38%)`;
  const accent = `hsl(${(hue + 40) % 360} 55% 45%)`;
  const cells: string[] = [];
  const cell = 20;
  for (let y = 0; y < 5; y += 1) {
    const half = [random() < 0.5, random() < 0.5, random() < 0.5];
    const row = [...half, half[1]!, half[0]!];
    for (let x = 0; x < 5; x += 1) {
      if (!row[x]) continue;
      cells.push(`<rect fill="${random() < 0.3 ? accent : foreground}" height="${cell}" width="${cell}" x="${x * cell}" y="${y * cell}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="${background}" height="100" width="100"/>${cells.join("")}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Rasterize the owned generated SVG before it enters the avatar upload path. */
export async function rasterizeGeneratedAvatar(seed: string): Promise<Blob> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("avatar_rasterizer_unavailable");
  }
  const image = new Image();
  image.decoding = "async";
  image.src = generatedAvatarSrc(seed);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("avatar_rasterizer_unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (blob === null) throw new Error("avatar_rasterizer_unavailable");
  return blob;
}

/** Cloudflare owns CF-Connecting-IP at these Worker entrypoints. Same-zone
 * subrequests derive that header from x-real-ip; copy only the validated edge
 * value, never a browser-supplied forwarding chain. This is a server boundary,
 * deliberately separate from the browser request-header allowlist. */
export function preserveTrustedEdgeAddress(source: Headers, target: Headers): void {
  target.delete("x-real-ip");
  const address = source.get("cf-connecting-ip");
  if (address === null || address.length > 45 || !/^[0-9a-f:.]+$/iu.test(address)) return;
  if (address.includes(":")) {
    try { new URL(`http://[${address}]/`); } catch { return; }
  } else {
    const octets = address.split(".");
    if (octets.length !== 4 || octets.some(octet => !/^(?:0|[1-9][0-9]{0,2})$/u.test(octet) || Number(octet) > 255)) return;
  }
  target.set("x-real-ip", address);
}

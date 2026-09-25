import { type HnsSshTransport, sshToStagingHost } from "./hns-regtest-publisher.ts";

// The private TLS gateway listens only on the CI host's staging bridge, so
// host checks run there over the existing SSH transport. Only a validated
// host name reaches the command; the page marker travels on stdin and the
// remote side returns just a status code and whether the marker was found.
const GATEWAY_ADDRESS = "172.31.254.2";
const APP_HOST = /^app\.e2e[a-z0-9]{6,40}$/u;
const UNCLAIMED_HOST = /^app\.e2eunclaimed[a-z0-9]{8,24}$/u;
const MARKER = /^[\x20-\x7e]{1,120}$/u;
const RESULT = /^([0-9]{3}) ([01])$/u;

export type HnsGatewayProbe = Readonly<{ status: number; markerFound: boolean }>;

export function gatewayProbeCommand(host: string): string {
  if (!APP_HOST.test(host) && !UNCLAIMED_HOST.test(host)) throw new Error("Gateway probe host is not an e2e app host.");
  return [
    "set -u",
    "marker=$(cat)",
    "body=$(mktemp)",
    `code=$(curl -sk --max-time 20 --max-filesize 1048576 --resolve '${host}:443:${GATEWAY_ADDRESS}' -o "$body" -w '%{http_code}' 'https://${host}/' || true)`,
    'if grep -qF -- "$marker" "$body"; then found=1; else found=0; fi',
    'rm -f "$body"',
    'printf "%s %s" "${code:-000}" "$found"',
  ].join("; ");
}

export function parseGatewayProbe(output: string): HnsGatewayProbe {
  const match = RESULT.exec(output.trim());
  if (!match) throw new Error("Gateway probe returned an unexpected result.");
  return { status: Number(match[1]), markerFound: match[2] === "1" };
}

export async function probePrivateGateway(
  host: string,
  marker: string,
  transport: HnsSshTransport = sshToStagingHost,
): Promise<HnsGatewayProbe> {
  if (!MARKER.test(marker)) throw new Error("Gateway probe marker must be printable ASCII.");
  const output = await transport(gatewayProbeCommand(host), new TextEncoder().encode(marker), 45_000);
  return parseGatewayProbe(output);
}

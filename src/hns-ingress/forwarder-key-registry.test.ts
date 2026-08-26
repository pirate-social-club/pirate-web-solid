import { describe, expect, it } from "vitest";
import {
  HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA,
  parseHnsForwarderV3KeyRegistry,
} from "./forwarder-key-registry.ts";

const keyBase64Url = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64url");

interface RegistryFixtureOptions {
  readonly unexpected?: boolean;
  readonly signingEnabled?: boolean;
}

function registry(options: RegistryFixtureOptions = {}): string {
  const document = {
    schema: HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA,
    registry_reference: "solid-forwarder-keys",
    registry_version: "2026-08-26-v1",
    keys: [
      {
        key_id: "gateway-key-01",
        key_base64url: keyBase64Url,
        signing_enabled: options.signingEnabled ?? true,
        verify_not_before: 1_769_999_000,
        verify_not_after: 1_770_100_000,
      },
    ],
  };
  return options.unexpected === true
    ? JSON.stringify({ ...document, unexpected: true })
    : JSON.stringify(document);
}

describe("production forwarder-v3 key registry", () => {
  it("accepts the exact shared schema and binds reference and version", () => {
    const parsed = parseHnsForwarderV3KeyRegistry(
      registry(),
      "solid-forwarder-keys",
      "2026-08-26-v1",
    );
    expect(parsed.verificationKey("gateway-key-01", 1_770_000_000)?.keyBytes).toEqual(
      new Uint8Array(Buffer.from("0123456789abcdef0123456789abcdef")),
    );
    expect(parsed.verificationKey("gateway-key-01", 1_800_000_000)).toBeNull();
  });

  it("rejects mismatched identity, extra fields, and ambiguous signing keys", () => {
    expect(() => parseHnsForwarderV3KeyRegistry(registry(), "other", "2026-08-26-v1")).toThrowError(
      /HNS ingress failed: misconfigured/u,
    );
    expect(() =>
      parseHnsForwarderV3KeyRegistry(
        registry({ unexpected: true }),
        "solid-forwarder-keys",
        "2026-08-26-v1",
      ),
    ).toThrowError(/HNS ingress failed: misconfigured/u);
    expect(() =>
      parseHnsForwarderV3KeyRegistry(
        registry({ signingEnabled: false }),
        "solid-forwarder-keys",
        "2026-08-26-v1",
      ),
    ).toThrowError(/HNS ingress failed: misconfigured/u);
  });

  it("never includes registry bytes in its error", () => {
    const sensitive = "registry-material-must-not-appear";
    let message = "";
    try {
      parseHnsForwarderV3KeyRegistry(sensitive, "solid-forwarder-keys", "2026-08-26-v1");
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toContain(sensitive);
    expect(message).toBe("HnsIngressFailure: HNS ingress failed: misconfigured");
  });
});

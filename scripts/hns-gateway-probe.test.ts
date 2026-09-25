import { describe, expect, test } from "bun:test";
import { gatewayProbeCommand, parseGatewayProbe, probePrivateGateway } from "../e2e/fixtures/hns-gateway-probe.ts";

describe("private gateway probe", () => {
  test("accepts only e2e app hosts and keeps the marker out of the command", async () => {
    expect(gatewayProbeCommand("app.e2ec1a08900e0d543b9a5b96d63")).toContain(
      "--resolve 'app.e2ec1a08900e0d543b9a5b96d63:443:172.31.254.2'",
    );
    expect(gatewayProbeCommand("app.e2eunclaimed0123abcd")).toContain("https://app.e2eunclaimed0123abcd/");
    for (const host of ["app.dankmemes", "app.e2e1;reboot", "e2eabcdefg", "app.e2eABCDEF12", "app.e2eabc'x"]) {
      expect(() => gatewayProbeCommand(host)).toThrow("not an e2e app host");
    }
    let seen: { command: string; input: string } | undefined;
    const result = await probePrivateGateway("app.e2eabcdef12", "E2E HNS community", async (command, input) => {
      seen = { command, input: new TextDecoder().decode(input) };
      return "200 1";
    });
    expect(result).toEqual({ status: 200, markerFound: true });
    expect(seen?.input).toBe("E2E HNS community");
    expect(seen?.command).not.toContain("E2E HNS community");
  });

  test("parses only the fixed result shape", () => {
    expect(parseGatewayProbe("421 0\n")).toEqual({ status: 421, markerFound: false });
    for (const bad of ["", "200", "200 2", "<html>", "200 1 extra"]) {
      expect(() => parseGatewayProbe(bad)).toThrow("unexpected result");
    }
  });

  test("refuses markers that are not printable ASCII", async () => {
    await expect(probePrivateGateway("app.e2eabcdef12", "line\nbreak", async () => "200 1")).rejects.toThrow(
      "printable ASCII",
    );
  });
});

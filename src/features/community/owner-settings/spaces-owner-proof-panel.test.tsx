import { render } from "@solidjs/web";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import { SpacesOwnerProofPanel } from "./spaces-owner-proof-panel";
import type { SpacesOwnerProofApi } from "./spaces-owner-proof-api";

const nodes: HTMLElement[] = [];
afterEach(() => { for (const node of nodes.splice(0)) node.remove(); });

async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }

describe("Spaces owner proof", () => {
  test("shows the digest, submits only the signature, and keeps a pending proof private", async () => {
    const calls: unknown[] = [];
    const api: SpacesOwnerProofApi = {
      async start(input) {
        calls.push(input);
        return { contract: "pirate-spaces-ownership-start-v1", ceremony_id: "ceremony-1", generation: 1,
          network: "mainnet", canonical_root: "yahoo", root_outpoint: "root:1", root_key_hex: "a".repeat(64),
          challenge_message: "Pirate Spaces owner proof", challenge_digest_hex: "b".repeat(64),
          expires_at: "2026-09-25T20:00:00Z", replayed: false };
      },
      async poll(input) {
        calls.push(input);
        return { contract: "pirate-spaces-ownership-result-v1", ceremony_id: "ceremony-1", generation: 1,
          status: "verification_pending", retry_after_seconds: 30, replayed: false };
      },
    };
    const node = document.createElement("div");
    document.body.appendChild(node);
    nodes.push(node);
    render(() => <SpacesOwnerProofPanel api={api} communityId="community-1" />, node);
    const user = userEvent.setup();
    const root = node.querySelector<HTMLInputElement>("#spaces-owner-root")!;
    await user.type(root, "@yahoo");
    await user.click(node.querySelector<HTMLButtonElement>("button")!);
    await settle();
    expect(node.querySelector("[data-spaces-challenge-digest]")?.textContent ?? node.textContent).toContain("b".repeat(64));
    expect(node.textContent).toContain("sends no Bitcoin transaction");
    const signature = node.querySelector<HTMLTextAreaElement>("#spaces-owner-signature")!;
    await user.type(signature, "c".repeat(128));
    await user.click([...node.querySelectorAll("button")].find((button) => button.textContent === "Check signature")!);
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ canonicalRoot: "yahoo" });
    expect(calls[1]).toMatchObject({ ceremonyId: "ceremony-1", signatureHex: "c".repeat(128) });
    expect(node.textContent).toContain("Check this proof again");
    expect(node.querySelector("[data-spaces-challenge]")).not.toBeNull();
  });
});

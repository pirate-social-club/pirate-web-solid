import type { GetPublicPersonasPersonaIdResponse } from "@pirate/api-client-happy-path";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalAssetTarget, documentClientEntry } from "../../../asset-target.ts";
import {
  canonicalPersonaPath,
  projectPersonaPublicProfile,
} from "./persona-public-profile.model.ts";
import PersonaPublicProfile from "./persona-public-profile.tsx";
import {
  personaIdFromRequest,
  resolvePersonaPublicProfilePreflight,
} from "./persona-public-profile-preflight.ts";

const persona = {
  persona_id: "persona_public_01",
  object: "persona" as const,
  display_name: "Public Persona",
  avatar_ref: "/media/avatar-public",
  primary_public_handle: null,
};

function response(): GetPublicPersonasPersonaIdResponse {
  return {
    persona,
    profile: { revision: 1, cover_ref: null, bio: "A public persona profile." },
    handle_grants: [{
      grant_id: "grant-01", grant_generation: 1, community_id: "community-01",
      owner_persona: { ...persona }, sale_namespace_activation_id: "activation-01",
      sale_namespace_activation_generation: 1, fulfillment: { kind: "hosted_persona_v1" },
      handle: { family: "hns", namespace_root: "example", handle_label: "public-name" },
      display_identifier: "public-name.example",
      host: { kind: "available", normalized_host: "public-name.example", sale_namespace_activation_generation: 1, grant_generation: 1 },
      issued_at: "2026-08-26T00:00:00.000Z",
    }],
  };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe("persona-native public profile", () => {
  it("uses an exact encoded persona route and validates nested identity plus bytewise order", () => {
    expect(canonicalAssetTarget("/assets/entry.js", "https://pirate.sc")).toBe("https://pirate.sc/assets/entry.js");
    expect(documentClientEntry("/assets/entry.js", "https://pirate.sc", false)).toBeUndefined();
    expect(canonicalPersonaPath("persona:public/one")).toBe("/p/persona%3Apublic%2Fone");
    expect(personaIdFromRequest(new Request("https://pirate.sc/p/persona_public_01"))).toBe("persona_public_01");
    expect(personaIdFromRequest(new Request("https://pirate.sc/p/%70ersona_public_01"))).toBe("");
    expect(projectPersonaPublicProfile(response(), "persona_public_01")).toMatchObject({
      kind: "success",
      canonicalUrl: "https://pirate.sc/p/persona_public_01",
    });
    expect(projectPersonaPublicProfile({
      ...response(),
      handle_grants: [{ ...response().handle_grants[0]!, owner_persona: { ...persona, persona_id: "sibling" } }],
    }, "persona_public_01")).toEqual({ kind: "unavailable", status: 502 });
    const second = {
      ...response().handle_grants[0]!,
      grant_id: "grant-00",
      handle: { family: "hns" as const, namespace_root: "aaa", handle_label: "aaa" },
      host: { kind: "not_applicable" as const },
    };
    expect(projectPersonaPublicProfile({ ...response(), handle_grants: [response().handle_grants[0]!, second] }, "persona_public_01"))
      .toEqual({ kind: "unavailable", status: 502 });
  });

  it("accepts only GET and HEAD at the canonical public route", async () => {
    await expect(resolvePersonaPublicProfilePreflight(
      new Request("https://pirate.sc/p/persona_public_01", { method: "POST" }),
      "https://api-next.pirate.sc",
    )).resolves.toEqual({
      personaId: "persona_public_01",
      state: { kind: "method-not-allowed", status: 405 },
    });
  });

  it("renders only public fields and makes every emitted target canonical", async () => {
    const state = projectPersonaPublicProfile(response(), "persona_public_01");
    const container = document.createElement("div");
    document.body.appendChild(container);
    let dispose: () => void = () => undefined;
    createRoot(rootDispose => {
      dispose = rootDispose;
      solidRender(() => <PersonaPublicProfile state={state} />, container);
    });
    cleanups.push(() => { dispose(); container.remove(); });
    expect(container.querySelector("h1")?.textContent).toBe("Public Persona");
    expect(container.textContent).toContain("public-name.example");
    expect(container.textContent).not.toContain("community-01");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://pirate.sc/media/avatar-public");
    for (const element of container.querySelectorAll("a[href], img[src]")) {
      const target = element.getAttribute(element instanceof HTMLImageElement ? "src" : "href");
      expect(target?.startsWith("https://pirate.sc")).toBe(true);
    }
    await vi.waitFor(() => expect(document.head.querySelector("link[rel='canonical']")?.getAttribute("href"))
      .toBe("https://pirate.sc/p/persona_public_01"));
    expect(container.querySelector("button, input, form")).toBeNull();
  });
});

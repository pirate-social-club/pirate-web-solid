// @vitest-environment jsdom
import { ApiClientError } from "@pirate/api-client";
import { describe, expect, test, vi } from "vitest";

import {
  createSessionStore,
  resolveAccountSession,
  resolveSession,
  type SessionResolutionClient,
} from "./session.ts";

function authError(status: number): ApiClientError {
  return new ApiClientError(
    { status, code: "auth_error", name: "AuthError", retryable: false },
    { error: { code: "auth_error", message: "not authenticated", retryable: false } },
  );
}

const personasPage = {
  personas: [
    {
      persona_id: "persona-active",
      status: "active",
      community_binding: { community_id: "community-a", binding_source: "first_membership" },
      profile: {
        display_name: "Active Pirate",
        avatar_ref: "avatar-1",
        primary_public_handle: "active-pirate",
      },
    },
    {
      persona_id: "persona-retired",
      status: "retired",
      community_binding: { community_id: "community-a", binding_source: "first_membership" },
      profile: {
        display_name: "Retired Pirate",
        avatar_ref: null,
        primary_public_handle: null,
      },
    },
    {
      persona_id: "persona-suspended", status: "suspended",
      community_binding: { community_id: "community-a", binding_source: "first_membership" },
      profile: { display_name: "Suspended", avatar_ref: null, primary_public_handle: null },
    },
  ],
};

const activePersonaProjection = {
  personaId: "persona-active",
  displayName: "Active Pirate",
  avatarRef: "avatar-1",
  primaryPublicHandle: "active-pirate",
  communityBinding: { communityId: "community-a", bindingSource: "first_membership" },
};

describe("browser session resolution", () => {
  test("resolves the home shell from the account without waiting for personas", async () => {
    const getPersonas = vi.fn(async () => { throw new Error("persona projection unavailable"); });
    const result = await resolveAccountSession({
      client: {
        get_usersMe: async () => {
          // SAFETY: the account-only resolver reads only the generated response id.
          return { id: "user-1" } as never;
        },
      },
    });

    expect(result).toEqual({ status: "authenticated", userId: "user-1" });
    expect(getPersonas).not.toHaveBeenCalled();
  });

  test("returns authenticated when the session endpoint succeeds", async () => {
    let input: undefined | unknown = "not-called";
    const result = await resolveSession({
      client: {
        get_usersMe: candidate => {
          input = candidate;
          // SAFETY: the resolver reads only the generated response id.
          return Promise.resolve({ id: "user-1" } as never);
        },
        // SAFETY: the resolver reads only the generated persona status and
        // public profile fields supplied by this focused fixture.
        get_personas: () => Promise.resolve(personasPage as never),
      },
    });

    expect(result).toEqual({
      status: "authenticated",
      userId: "user-1",
      personas: [activePersonaProjection],
    });
    expect(input).toBeUndefined();
  });

  test("treats only an explicit 401 as anonymous", async () => {
    // The persona read starts concurrently with the account read; when the
    // account resolves anonymous its result — including its rejection — is
    // discarded.
    const result = await resolveSession({
      client: {
        get_usersMe: async () => { throw authError(401); },
        get_personas: async () => { throw authError(401); },
      },
    });
    expect(result).toBe("anonymous");
  });

  test("leaves non-auth failures visible to the route fallback", async () => {
    await expect(resolveSession({
      client: {
        get_usersMe: async () => { throw authError(503); },
        get_personas: async () => { throw authError(401); },
      },
    })).rejects.toThrow("not authenticated");
  });
});

describe("shared session store", () => {
  interface ClientSpies {
    readonly client: SessionResolutionClient;
    readonly get_usersMe: ReturnType<typeof vi.fn>;
    readonly get_personas: ReturnType<typeof vi.fn>;
  }
  function stubClient(overrides: {
    usersMe?: () => Promise<{ id: string }>;
    personas?: () => Promise<{ personas: unknown[] }>;
  } = {}): ClientSpies {
    const get_usersMe = vi.fn(overrides.usersMe ?? (async () => ({ id: "user-1" })));
    const get_personas = vi.fn(overrides.personas ?? (async () => ({ personas: [] })));
    return {
      // SAFETY: the spies model only the two generated session reads the
      // store composes; their fixture bodies carry exactly the projected
      // fields and nothing else crosses this boundary.
      client: { get_usersMe, get_personas } as never,
      get_usersMe,
      get_personas,
    };
  }

  function storeFrom(spies: ClientSpies) {
    return createSessionStore(() => spies.client);
  }

  test("coalesces concurrent account and session callers onto one request each", async () => {
    const spies = stubClient();
    const store = storeFrom(spies);
    const [accountA, accountB, session] = await Promise.all([
      store.resolveAccountSession(),
      store.resolveAccountSession(),
      store.resolveSession(),
    ]);

    expect(accountA).toEqual({ status: "authenticated", userId: "user-1" });
    expect(accountB).toEqual(accountA);
    expect(session).toEqual({ status: "authenticated", userId: "user-1", personas: [] });
    expect(spies.get_usersMe).toHaveBeenCalledTimes(1);
    expect(spies.get_personas).toHaveBeenCalledTimes(1);
  });

  test("starts the persona read before the account read settles", async () => {
    let releaseUsers!: (value: { id: string }) => void;
    const spies = stubClient({
      usersMe: () => new Promise(resolve => { releaseUsers = resolve; }),
      personas: () => Promise.resolve(personasPage),
    });
    const store = storeFrom(spies);

    const pending = store.resolveSession();
    // Both reads start synchronously inside the shared resolution; neither
    // waits for the other.
    expect(spies.get_personas).toHaveBeenCalledTimes(1);
    expect(spies.get_usersMe).toHaveBeenCalledTimes(1);

    releaseUsers({ id: "user-1" });
    await expect(pending).resolves.toEqual({
      status: "authenticated",
      userId: "user-1",
      personas: [activePersonaProjection],
    });
  });

  test("keeps a failed attempt off the slot so a retry starts fresh", async () => {
    let attempts = 0;
    const spies = stubClient({
      usersMe: async () => {
        attempts += 1;
        throw authError(503);
      },
    });
    const store = storeFrom(spies);

    await expect(store.resolveAccountSession()).rejects.toThrow("not authenticated");
    await expect(store.resolveSession()).rejects.toThrow("not authenticated");
    expect(attempts).toBe(2);
  });

  test("refresh drops the cached resolutions and notifies subscribers", async () => {
    let calls = 0;
    const spies = stubClient({
      usersMe: async () => {
        calls += 1;
        return { id: `user-${calls}` };
      },
    });
    const store = storeFrom(spies);

    await expect(store.resolveAccountSession()).resolves.toEqual({ status: "authenticated", userId: "user-1" });
    const listener = vi.fn();
    const unsubscribe = store.onSessionRefreshed(listener);

    store.refreshSession();
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(store.resolveAccountSession()).resolves.toEqual({ status: "authenticated", userId: "user-2" });

    unsubscribe();
    store.refreshSession();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("explicit transport bypasses the slots so injected callers stay deterministic", async () => {
    const spies = stubClient();
    const store = storeFrom(spies);
    const injected = stubClient();

    await store.resolveAccountSession();
    await store.resolveAccountSession({ client: injected.client });
    await store.resolveSession({ client: injected.client });

    expect(spies.get_usersMe).toHaveBeenCalledTimes(1);
    expect(spies.get_personas).not.toHaveBeenCalled();
    expect(injected.get_usersMe).toHaveBeenCalledTimes(2);
    expect(injected.get_personas).toHaveBeenCalledTimes(1);
  });
});

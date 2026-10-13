import { ApiClientError } from "@pirate/api-client";
import { assign, fromPromise, setup } from "xstate";

import type { SpacesOwnerProgress, SpacesOwnerProofApi } from "./spaces-owner-proof-api";

export interface SpacesProofScope {
  communityId: string;
  accountId: string | null | undefined;
  revision: number;
}

type Command =
  | { type: "start"; replace: boolean }
  | { type: "poll"; ceremonyId: string; generation: number; signatureHex: string }
  | { type: "resume"; ceremonyId: string; generation: number; key: string }
  | { type: "assignment" }
  | { type: "confirm"; assignmentId: string; generation: number; authority: string; authorityGeneration: number };

interface Context {
  scope: SpacesProofScope;
  accountId?: string;
  roots: string[];
  root?: string;
  progress?: SpacesOwnerProgress;
  command?: Command;
  notice: string;
}

type Event =
  | { type: "SCOPE"; scope: SpacesProofScope }
  | { type: "SELECT"; root: string; scope: SpacesProofScope }
  | { type: "CHOOSE"; scope: SpacesProofScope }
  | { type: "START"; root: string; scope: SpacesProofScope; replace?: boolean }
  | { type: "POLL"; signatureHex: string }
  | { type: "RESUME" }
  | { type: "ASSIGN" }
  | { type: "CONFIRM" }
  | { type: "REFRESH" };

interface Dependencies {
  api: SpacesOwnerProofApi;
  authorize(scope: SpacesProofScope, expectedAccount: string | undefined, signal: AbortSignal): Promise<string | undefined>;
  isCurrent(scope: SpacesProofScope): boolean;
  commandKey(accountId: string, communityId: string, root: string, operation: string, basis: string): string;
}

interface MachineInput { scope: SpacesProofScope }

class SignInRequired extends Error {}

export function canonicalSpacesRoot(value: string): string | undefined {
  const root = value.trim().toLowerCase().replace(/^@/u, "");
  return /^[a-z0-9][a-z0-9-]{0,61}$/u.test(root) ? root : undefined;
}

export function freshSpacesProof(progress: SpacesOwnerProgress | undefined) {
  const ceremony = progress?.ceremony;
  return ceremony?.status === "verified" && ceremony.proof_status === "fresh" ? ceremony.result : undefined;
}

export function spacesProofNotice(progress: SpacesOwnerProgress | undefined): string {
  const ceremony = progress?.ceremony;
  if (ceremony?.status === "verification_pending") return "The chain is updating. Check this proof again.";
  if (ceremony?.status === "verified") {
    if (ceremony.proof_status === "fresh") return "Ownership verified. Check for the operator address after operate is confirmed.";
    if (ceremony.proof_status === "unavailable") return "The chain could not be checked. Refresh status to check again.";
    if (ceremony.proof_status === "root_changed") return "The root changed. Get a new ownership message.";
    if (ceremony.proof_status === "superseded") return "This proof was replaced. Get a new ownership message.";
    return "Ownership proof expired. Get a new ownership message.";
  }
  if (ceremony?.status === "superseded") return "This proof was replaced. Get a new ownership message.";
  if (ceremony?.status === "ended") {
    if (ceremony.result.status === "signature_rejected") return "That signature did not match. Get a new ownership message.";
    return ceremony.result.status === "root_changed"
      ? "The root changed. Get a new ownership message." : "The message expired. Get a new ownership message.";
  }
  return "";
}

export function canStartSpacesProof(progress: SpacesOwnerProgress | undefined): boolean {
  const ceremony = progress?.ceremony;
  return ceremony == null || ceremony.status === "ended" || ceremony.status === "superseded"
    || (ceremony.status === "verified" && ceremony.proof_status !== "fresh" && ceremony.proof_status !== "unavailable");
}

/** Storage retains only command identities. Server readback owns all private progress. */
export function createSpacesCommandKeys(storage?: Pick<Storage, "getItem" | "setItem">) {
  const memory = new Map<string, string>();
  return (accountId: string, communityId: string, root: string, operation: string, basis: string) => {
    const name = `spaces-owner-command:${JSON.stringify([accountId, communityId, root, operation, basis])}`;
    const saved = memory.get(name) ?? storage?.getItem(name);
    if (saved != null) return saved;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const key = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
    // A failed storage write stops the command, rather than silently replacing its identity after reload.
    storage?.setItem(name, key);
    memory.set(name, key);
    return key;
  };
}

export function createSpacesOwnerProofMachine(dependencies: Dependencies) {
  const check = (context: Context, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!dependencies.isCurrent(context.scope)) throw new DOMException("Scope changed", "AbortError");
  };
  const authorize = async (context: Context, signal: AbortSignal) => {
    check(context, signal);
    if (context.scope.accountId === null) throw new SignInRequired();
    const accountId = await dependencies.authorize(context.scope, context.accountId, signal);
    check(context, signal);
    if (accountId === undefined) throw new SignInRequired();
    if (context.accountId !== undefined && accountId !== context.accountId) throw new SignInRequired();
    return accountId;
  };
  const read = async (context: Context, signal: AbortSignal) => {
    if (context.root === undefined) throw new Error("Choose a root first");
    const accountId = await authorize(context, signal);
    const progress = await dependencies.api.read({ communityId: context.scope.communityId, root: context.root }, signal);
    check(context, signal);
    if (progress.canonical_root !== context.root || progress.network !== "mainnet") throw new Error("Progress scope mismatch");
    if (progress.ceremony != null && progress.ceremony.challenge.canonical_root !== context.root
      || progress.operator_assignment != null && progress.operator_assignment.canonical_root !== context.root) throw new Error("Private progress scope mismatch");
    return { accountId, progress };
  };
  const requiresSignIn = (error: unknown) => error instanceof SignInRequired
    || (error instanceof ApiClientError && error.status === 401);
  const empty = (scope: SpacesProofScope): Context => ({ scope, accountId: undefined, roots: [], root: undefined,
    progress: undefined, command: undefined, notice: "" });

  return setup({
    // SAFETY: XState's types field declares compile-time contracts; these placeholders are never runtime context or events.
    types: { context: {} as Context, events: {} as Event, input: {} as MachineInput },
    actors: {
      discover: fromPromise<{ accountId: string; roots: string[] }, Context>(async ({ input, signal }) => {
        const accountId = await authorize(input, signal);
        const roots = new Set<string>();
        const cursors = new Set<string>();
        let cursor: string | undefined;
        do {
          const page = await dependencies.api.roots({ communityId: input.scope.communityId, cursor }, signal);
          check(input, signal);
          for (const item of page.items) roots.add(item.canonical_root);
          cursor = page.next_cursor ?? undefined;
          if (cursor !== undefined && cursors.has(cursor)) throw new Error("Saved-root cursor repeated");
          if (cursor !== undefined) cursors.add(cursor);
        } while (cursor !== undefined);
        return { accountId, roots: [...roots] };
      }),
      read: fromPromise<Awaited<ReturnType<typeof read>>, Context>(({ input, signal }) => read(input, signal)),
      command: fromPromise<Awaited<ReturnType<typeof read>> & { notice?: string }, Context>(async ({ input, signal }) => {
        const current = await read(input, signal);
        const { progress, accountId } = current;
        const command = input.command;
        if (command === undefined || input.root === undefined) return current;
        const ceremony = progress.ceremony;
        const proof = freshSpacesProof(progress);
        const candidate = progress.operator_assignment;
        const key = (operation: string, basis: string) => dependencies.commandKey(accountId, input.scope.communityId, input.root!, operation, basis);
        // Revalidate the session after readback and immediately before any further effect.
        await authorize({ ...input, accountId }, signal);
        check(input, signal);
        switch (command.type) {
          case "start": {
            if (!canStartSpacesProof(progress) && !(command.replace && ceremony?.status === "awaiting_signature")) return current;
            const result = await dependencies.api.start({ communityId: input.scope.communityId, canonicalRoot: input.root,
              idempotencyKey: key("start", ceremony?.challenge.ceremony_id ?? "first") }, signal);
            check(input, signal);
            const next = await read({ ...input, accountId }, signal);
            return { ...next, notice: "status" in result && next.progress.ceremony === null ? "The chain is updating. Refresh status before trying again." : undefined };
          }
          case "poll":
            if (ceremony?.status !== "awaiting_signature" || ceremony.challenge.ceremony_id !== command.ceremonyId
              || ceremony.challenge.generation !== command.generation) return current;
            await dependencies.api.poll({ communityId: input.scope.communityId, ceremonyId: command.ceremonyId,
              idempotencyKey: key("poll", `${command.ceremonyId}:${command.generation}`), signatureHex: command.signatureHex }, signal);
            break;
          case "resume":
            if (ceremony?.status !== "verification_pending" || ceremony.challenge.ceremony_id !== command.ceremonyId
              || ceremony.challenge.generation !== command.generation || ceremony.pending_poll_key !== command.key) return current;
            await dependencies.api.resume({ communityId: input.scope.communityId, ceremonyId: command.ceremonyId,
              idempotencyKey: ceremony.pending_poll_key }, signal);
            break;
          case "assignment": {
            if (proof === undefined || candidate?.status === "confirmed" && candidate.current) return current;
            const result = await dependencies.api.assignment({ communityId: input.scope.communityId, root: input.root }, signal);
            check(input, signal);
            const next = await read({ ...input, accountId }, signal);
            return { ...next, notice: result.candidate === null ? "The operator address is not ready. Check again after operate is confirmed." : undefined };
          }
          case "confirm":
            if (proof === undefined || candidate?.status !== "prepared"
              || candidate.operator_assignment_id !== command.assignmentId || candidate.generation !== command.generation
              || proof.namespace_authority_reference !== command.authority
              || proof.namespace_authority_generation !== command.authorityGeneration) return current;
            await dependencies.api.confirmAssignment({ communityId: input.scope.communityId,
              idempotencyKey: key("confirm", `${command.assignmentId}:${command.generation}:${command.authority}:${command.authorityGeneration}`),
              assignmentId: command.assignmentId, generation: command.generation,
              authorityReference: command.authority, authorityGeneration: command.authorityGeneration }, signal);
            break;
        }
        check(input, signal);
        return read({ ...input, accountId }, signal);
      }),
    },
  }).createMachine({
    id: "spaces-owner-proof",
    context: ({ input }) => empty(input.scope),
    initial: "discovering",
    on: {
      SCOPE: { target: ".discovering", reenter: true, actions: assign(({ event }) => empty(event.scope)) },
      CHOOSE: { target: ".ready", reenter: true, actions: assign(({ context, event }) => ({ ...empty(event.scope), roots: context.roots, accountId: context.accountId })) },
      SELECT: { target: ".reading", reenter: true, actions: assign(({ event }) => ({ ...empty(event.scope), root: event.root })) },
    },
    states: {
      discovering: {
        invoke: { src: "discover", input: ({ context }) => context,
          onDone: { target: "selecting", actions: assign(({ event }) => ({ accountId: event.output.accountId,
            roots: event.output.roots, root: event.output.roots.length === 1 ? event.output.roots[0] : undefined })) },
          onError: [
            { guard: ({ event }) => requiresSignIn(event.error), target: "signInRequired" },
            { target: "unavailable" },
          ],
        },
        after: { 15000: "unavailable" },
      },
      selecting: { always: [{ guard: ({ context }) => context.root !== undefined, target: "reading" }, { target: "ready" }] },
      reading: {
        entry: assign({ progress: undefined, command: undefined, notice: "" }),
        invoke: { src: "read", input: ({ context }) => context,
          onDone: { target: "ready", actions: assign(({ event }) => ({ ...event.output, notice: "" })) },
          onError: [
            { guard: ({ event }) => requiresSignIn(event.error), target: "signInRequired" },
            { target: "unavailable" },
          ],
        },
        after: { 15000: "unavailable" },
      },
      ready: {
        entry: assign({ command: undefined }),
        on: {
          REFRESH: [{ guard: ({ context }) => context.root !== undefined, target: "reading" }, { target: "discovering" }],
          START: { guard: ({ event }) => canonicalSpacesRoot(event.root) !== undefined, target: "acting",
            actions: assign(({ event }) => ({ scope: event.scope, root: canonicalSpacesRoot(event.root),
              progress: undefined, notice: "", command: { type: "start" as const, replace: event.replace ?? false } })) },
          POLL: { guard: ({ context, event }) => context.progress?.ceremony?.status === "awaiting_signature" && /^[0-9a-f]{128}$/u.test(event.signatureHex),
            target: "acting", actions: assign(({ context, event }) => {
              const challenge = context.progress!.ceremony!.challenge;
              return { command: { type: "poll" as const, ceremonyId: challenge.ceremony_id, generation: challenge.generation, signatureHex: event.signatureHex }, notice: "" };
            }) },
          RESUME: { guard: ({ context }) => context.progress?.ceremony?.status === "verification_pending", target: "acting",
            actions: assign(({ context }) => {
              const ceremony = context.progress!.ceremony;
              return ceremony?.status === "verification_pending" ? { command: { type: "resume" as const,
                ceremonyId: ceremony.challenge.ceremony_id, generation: ceremony.challenge.generation, key: ceremony.pending_poll_key }, notice: "" } : {};
            }) },
          ASSIGN: { guard: ({ context }) => freshSpacesProof(context.progress) !== undefined, target: "acting",
            actions: assign({ command: { type: "assignment" }, notice: "" }) },
          CONFIRM: { guard: ({ context }) => freshSpacesProof(context.progress) !== undefined && context.progress?.operator_assignment?.status === "prepared",
            target: "acting", actions: assign(({ context }) => {
              const candidate = context.progress!.operator_assignment!;
              const proof = freshSpacesProof(context.progress)!;
              return { command: { type: "confirm" as const, assignmentId: candidate.operator_assignment_id, generation: candidate.generation,
                authority: proof.namespace_authority_reference, authorityGeneration: proof.namespace_authority_generation }, notice: "" };
            }) },
        },
      },
      acting: {
        invoke: { src: "command", input: ({ context }) => context,
          onDone: { target: "ready", actions: assign(({ event }) => ({ ...event.output, notice: event.output.notice ?? "" })) },
          onError: [
            { guard: ({ event }) => requiresSignIn(event.error), target: "signInRequired" },
            { target: "reading" },
          ],
        },
        // An unanswered write is never replayed automatically. Exit aborts its invocation, then read.
        after: { 15000: "reading" },
      },
      unavailable: { entry: assign({ progress: undefined, command: undefined, roots: [], notice: "Status could not be loaded. Refresh status to check again." }),
        on: { REFRESH: [{ guard: ({ context }) => context.root !== undefined, target: "reading" }, { target: "discovering" }] } },
      signInRequired: { entry: assign({ progress: undefined, command: undefined, roots: [], accountId: undefined, notice: "" }),
        on: { REFRESH: "discovering" } },
    },
  });
}

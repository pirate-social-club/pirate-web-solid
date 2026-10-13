import { For, Show, createSignal, onCleanup } from "solid-js";
import { formatUnits } from "viem";
import { resolveSession, sessionPersonasUnavailable, type AuthenticatedSession } from "../../api/session";
import { usePageUiLocale } from "../../lib/ui-locale";
import { getLocaleMessages } from "../../locales";
import { Button } from "../../design-system";
import { communityOperationPersonas, toOperationPersonas } from "../identity/community-persona-choice";
import { OperationPersonaControl } from "../identity/operation-persona-control/operation-persona-control";
import { claimStep } from "../rewards/winnings-model";
import { createIndexedDbGuestAuthorityStore, type GuestAuthorityStore } from "./guest-authority-selection";
import { createOwnerStudyFinancialApi, type OwnerStudyFinancialApi } from "./guest-study-financial-api";
import { createGuestStudyAccountingApi, type GuestStudyAccountingApi } from "./guest-study-accounting-api";
import { guestPurchaseStatus } from "./guest-study-reward-model";
import { boundedOwnerRequest, createOwnerStudyLocks, type OwnerStudyLocks } from "./owner-study-start-coordinator";
import type { OriginalOwnerCreditCommand } from "./owner-study-journal";
type Credit = Awaited<ReturnType<OwnerStudyFinancialApi["getCredit"]>>;
type Participation = Awaited<ReturnType<OwnerStudyFinancialApi["listParticipations"]>>["items"][number];
export interface OwnerStudyRecoveryControlsProps {
  finance?: OwnerStudyFinancialApi; accounting?: GuestStudyAccountingApi;
  store?: GuestAuthorityStore; locks?: OwnerStudyLocks; resolveAccount?: typeof resolveSession;
  /** Native successful binding is displayed, never relabelled to current canonical actor. */
  originalAccountId?: string;
}
/** Actual Account-only reads; Guest proof is neither consulted nor a fallback. */
export function OwnerStudyRecoveryControls(props: OwnerStudyRecoveryControlsProps) {
  const origin = window.location.origin;
  const copy = getLocaleMessages(usePageUiLocale(), "routes").guestStudyRewards;
  const finance = props.finance ?? createOwnerStudyFinancialApi({ origin });
  const accounting = props.accounting ?? createGuestStudyAccountingApi({ origin });
  let durable = props.store;
  const storeForMutation = () => {
    if (durable === undefined) {
      if (typeof indexedDB === "undefined") throw new Error("Durable financial storage unavailable");
      durable = createIndexedDbGuestAuthorityStore(origin);
    }
    return durable;
  };
  let mutationLocks = props.locks;
  const locksForMutation = () => {
    if (mutationLocks === undefined) {
      if (typeof navigator === "undefined" || navigator.locks === undefined) throw new Error("Financial browser coordination unavailable");
      mutationLocks = createOwnerStudyLocks(origin);
    }
    return mutationLocks;
  };
  const [session, setSession] = createSignal<AuthenticatedSession>();
  const [items, setItems] = createSignal<Participation[]>([]), [credits, setCredits] = createSignal<Credit[]>([]);
  const [pcursor, setPcursor] = createSignal<string | null>(null), [ccursor, setCcursor] = createSignal<string | null>(null);
  const [readState, setReadState] = createSignal<"idle" | "reading" | "known" | "unknown">("idle");
  const [chosen, setChosen] = createSignal(new Map<string, string>());
  const [busy, setBusy] = createSignal(false), [notice, setNotice] = createSignal("");
  let active = true, generation = 0, scopeAccountId: string | undefined;
  const clearScope = () => { setSession(undefined); setItems([]); setCredits([]); setPcursor(null); setCcursor(null); setChosen(new Map()); };
  const resolve = () => boundedOwnerRequest(() => (props.resolveAccount ?? resolveSession)());
  const assertActor = async (accountId: string, request: number) => {
    let current: Awaited<ReturnType<typeof resolveSession>>;
    try { current = await resolve(); } catch (error) {
      if (active && request === generation) { scopeAccountId = undefined; clearScope(); }
      throw error;
    }
    if (!active || request !== generation || current === "anonymous" || current.userId !== accountId) {
      if (active && request === generation) { scopeAccountId = undefined; clearScope(); }
      throw new Error("Original Account scope changed");
    }
    return current;
  };
  onCleanup(() => { active = false; generation++; });
  const read = async (more: boolean) => {
    if (!active || busy() || readState() === "reading") return;
    const request = ++generation, previousAccount = scopeAccountId;
    const previousItems = items(), previousCredits = credits(), previousPcursor = pcursor(), previousCcursor = ccursor();
    setSession(undefined); setReadState("reading"); setNotice("");
    try {
      const current = await resolve();
      if (!active || request !== generation) return;
      if (current === "anonymous") throw new Error("Ordinary Account unavailable");
      const sameAccount = previousAccount === current.userId;
      if (!sameAccount) clearScope();
      scopeAccountId = current.userId;
      const append = more && sameAccount;
      const [participations, winnings] = await Promise.all([
        boundedOwnerRequest(signal => finance.listParticipations({ query: { limit: "100", ...(append && previousPcursor !== null ? { cursor: previousPcursor } : {}) } }, signal)),
        boundedOwnerRequest(signal => finance.listCredits({ query: { limit: "100", ...(append && previousCcursor !== null ? { cursor: previousCcursor } : {}) } }, signal)),
      ]);
      await assertActor(current.userId, request);
      const p = new Map((append ? previousItems : []).map(v => [v.participation_id, v]));
      const c = new Map((append ? previousCredits : []).map(v => [v.credit_id, v]));
      for (const v of participations.items) p.set(v.participation_id, v);
      for (const v of winnings.items) c.set(v.credit_id, v);
      setSession(current); setItems([...p.values()]); setCredits([...c.values()]);
      setPcursor(participations.next_cursor); setCcursor(winnings.next_cursor); setReadState("known");
    } catch { if (active && request === generation) { scopeAccountId = undefined; clearScope(); setReadState("unknown"); setNotice("Account recovery is unresolved. Original participations and held winnings remain owed; no Guest proof will be retried here."); } }
  };
  const refreshOriginal = async (item: Participation) => {
    const actor = session(), request = generation; if (actor === undefined || busy()) return;
    try { await assertActor(actor.userId, request); const next = await boundedOwnerRequest(signal => finance.getParticipation({ path: { participationId: item.participation_id } }, signal));
      if (next.participation_id !== item.participation_id || next.pool_leg_id !== item.pool_leg_id || next.original_drawing_id !== item.original_drawing_id)
        throw new Error("Original participation differs");
      await assertActor(actor.userId, request);
      if (active) setItems(list => list.map(v => v.participation_id === next.participation_id ? next : v));
    } catch { if (active) setNotice("Original participation status is unknown. No different drawing or late purchase is inferred."); }
  };
  const mutate = async (credit: Credit, kind: OriginalOwnerCreditCommand["kind"]) => {
    const actor = session(), request = generation; if (!active || busy() || actor === undefined) return;
    setBusy(true); setNotice("");
    try { await locksForMutation().exclusive(async () => {
      await assertActor(actor.userId, request);
      const store = storeForMutation();
      const detail = await boundedOwnerRequest(signal => finance.getCredit({ path: { creditId: credit.credit_id } }, signal));
      if (!sameOriginalCredit(detail, credit)) throw new Error("Original credit differs");
      const journal = await store.read();
      if (journal.ownerCreditCommands?.some(c => c.creditId === credit.credit_id && c.kind === kind && c.state === "submitted" && c.accountId !== actor.userId))
        throw new Error("An original command remains unresolved in another Account scope");
      let saved = journal.ownerCreditCommands?.find(c => c.accountId === actor.userId && c.creditId === credit.credit_id && c.kind === kind && c.state === "submitted");
      if (saved === undefined) {
        if (kind === "recipient_selection") {
          const personaId = chosen().get(credit.credit_id);
          if (sessionPersonasUnavailable(actor) || personaId === undefined || !communityOperationPersonas(actor.personas, credit.community_id).some(p => p.personaId === personaId)
            || credit.recipient.kind !== "guest_owner" || credit.recipient.binding !== null) throw new Error("Explicit exact-community persona required");
          saved = { accountId: actor.userId, creditId: credit.credit_id, kind, state: "submitted",
            body: { idempotency_key: crypto.randomUUID(), persona_id: personaId } };
        } else {
          const revision = detail.recipient.kind === "account_owner" ? null : detail.recipient.selection?.revision;
          if (revision === undefined) throw new Error("Choose the payout persona explicitly before claiming");
          saved = { accountId: actor.userId, creditId: credit.credit_id, kind, state: "submitted",
            body: { idempotency_key: crypto.randomUUID(), selection_revision: revision } };
        }
        const original = saved; await store.update(j => { (j.ownerCreditCommands ??= []).push(original); });
      }
      const original = saved;
      await assertActor(actor.userId, request);
      const result = original.kind === "recipient_selection"
        ? await boundedOwnerRequest(signal => accounting.selectCreditRecipient({ path: { creditId: original.creditId }, body: original.body }, signal))
        : await boundedOwnerRequest(signal => accounting.claimCredit({ path: { creditId: original.creditId }, body: original.body }, signal));
      const next = result.credit;
      if (!sameOriginalCredit(next, credit)) throw new Error("Original credit differs");
      if (original.kind === "recipient_selection" && (next.recipient.kind !== "guest_owner" || next.recipient.selection?.persona_id !== original.body.persona_id)) throw new Error("Original persona selection differs");
      await store.update(j => {
        const c = j.ownerCreditCommands?.find(v => v.accountId === original.accountId && v.body.idempotency_key === original.body.idempotency_key);
        if (c === undefined || JSON.stringify(c.body) !== JSON.stringify(original.body)) throw new Error("Original command differs"); c.state = "completed";
      });
      await assertActor(actor.userId, request);
      if (!active) return;
      setCredits(list => list.map(v => v.credit_id === next.credit_id ? next : v));
      if ("outcome" in result) {
        const step = claimStep(result.outcome);
        if (step.kind === "verify") {
          // Existing actual Very reward_claim authority; current host return only.
          const returnTo = new URL(window.location.href); returnTo.searchParams.set("owner_credit", credit.credit_id);
          window.location.assign(`/verify/very?purpose=reward_claim&return_to=${encodeURIComponent(returnTo.pathname + returnTo.search)}`);
        } else if (step.kind === "support" || step.kind === "held") setNotice("This amount remains held and owed. Your current verification cannot claim it; contact support.");
        else if (step.kind === "unavailable") setNotice("This original credit is not currently claimable. It remains recorded.");
      }
    }); } catch { if (active) setNotice("Original selection or claim is unresolved. Retry this original action; do not replace its key, persona, revision or drawing."); }
    finally { if (active) setBusy(false); }
  };
  return <section class="flex flex-col gap-3 p-5" data-owner-reward-recovery>
    <h2 class="font-semibold">Your original rewards</h2>
    <Show when={props.originalAccountId}><p>Original attachment target: {props.originalAccountId}. Account aliases do not change that receipt.</p></Show>
    <p>Signup changes access to original participation and held winnings. It does not create a late entry or move an original drawing.</p>
    <Button disabled={busy() || readState() === "reading"} onClick={() => void read(false)}>Read Account rewards</Button>
    <Show when={readState() === "unknown"}><p role="status">Recovery status is unknown; held winnings remain owed.</p></Show>
    <For each={items()}>{item => <div><p>Original drawing {item.original_drawing_id}: {copy.statuses[guestPurchaseStatus(item)]}</p><Button disabled={busy() || session() === undefined} onClick={() => void refreshOriginal(item)}>Refresh original participation</Button></div>}</For>
    <For each={credits()}>{credit => <article class="flex flex-col gap-2">
      <p>{formatUnits(BigInt(credit.amount_atomic), credit.token_decimals)} from original drawing {credit.original_drawing_id}. {ownerCreditStatus(credit)}.</p>
      <Show when={credit.recipient.kind === "guest_owner" && credit.recipient.binding === null}>
        <OperationPersonaControl label="Payout recipient" placeholder="Choose the payout persona" selectedPersonaId={chosen().get(credit.credit_id)}
          personas={toOperationPersonas(communityOperationPersonas(session()?.personas ?? [], credit.community_id))}
          onSelect={id => setChosen(old => new Map(old).set(credit.credit_id, id))} disabled={busy() || session() === undefined} />
        <Show when={communityOperationPersonas(session()?.personas ?? [], credit.community_id).length === 1}>{_available => {
          const sole = communityOperationPersonas(session()?.personas ?? [], credit.community_id)[0];
          return <Button disabled={busy() || session() === undefined || sole === undefined} onClick={() => { if (sole !== undefined) setChosen(old => new Map(old).set(credit.credit_id, sole.personaId)); }}>Use {sole?.displayName} as payout recipient</Button>;
        }}</Show>
        <Button disabled={busy() || session() === undefined} onClick={() => void mutate(credit, "recipient_selection")}>Select or retry original recipient</Button>
      </Show>
      <Show when={credit.claim.status !== "accepted"}>
        <Button disabled={busy() || session() === undefined} onClick={() => void mutate(credit, "owner_claim")}>Claim or retry original credit</Button>
      </Show>
    </article>}</For>
    <Show when={pcursor() !== null || ccursor() !== null}><Button disabled={busy() || session() === undefined} onClick={() => void read(true)}>Read more original rewards</Button></Show>
    <Show when={notice()}><p role="status">{notice()}</p></Show>
  </section>;
}

function sameOriginalCredit(a: Credit, b: Credit): boolean {
  return a.credit_id === b.credit_id && a.owner_id === b.owner_id && a.community_id === b.community_id
    && a.identity_version === b.identity_version && a.source_kind === b.source_kind && a.pool_leg_id === b.pool_leg_id
    && a.original_drawing_id === b.original_drawing_id && a.amount_atomic === b.amount_atomic
    && a.chain_id === b.chain_id && a.token_address === b.token_address && a.token_decimals === b.token_decimals;
}
function ownerCreditStatus(credit: Credit): string {
  if (credit.claim.status === "unclaimed") return "Held and owed; not claimed";
  if (credit.claim.status === "subject_conflict") return "Held and owed; contact support";
  switch (credit.claim.payout_status) {
    case "confirmed": return "Sent to your wallet";
    case "recipient_pending": return "Claim accepted; waiting for the recipient wallet";
    case "failed_retrying": return "Claim accepted; payment will retry";
    case "submitted": return "Claim accepted; payment submitted";
    default: return "Claim accepted; payment pending";
  }
}

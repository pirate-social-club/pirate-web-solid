import type { GuestAuthorityStore } from "./guest-authority-selection";
import type { OwnerStudyLocks } from "./owner-study-start-coordinator";
import { ErrorBoundary, For, Show, createSignal, onCleanup } from "solid-js";
import type { AuthenticatedSession } from "../../api/session";
import { usePageUiLocale } from "../../lib/ui-locale";
import { getLocaleMessages } from "../../locales";
import { guestParticipationStatus } from "./guest-study-reward-model";
import { Button } from "../../design-system";
import { requestGlobalSignInCompletion } from "../auth/global-sign-in-host";
import { communityOperationPersonas, toOperationPersonas } from "../identity/community-persona-choice";
import { OperationPersonaControl } from "../identity/operation-persona-control/operation-persona-control";
import { createOwnerStudyFinancialApi, createGuestStudyRewardPreviewReader, type OwnerStudyFinancialApi } from "./guest-study-financial-api";
import { createOwnerStudyStartCoordinator, boundedOwnerRequest, type OwnerStudyStartResult } from "./owner-study-start-coordinator";
import { createOwnerStudyRuntimeClient } from "./owner-study-runtime-client";
import { OwnerStudyRecoveryControls } from "./owner-study-recovery-controls";
import { StudyingRouteView } from "./studying-route-view";
import type { StudyingClient, StudyingRecorder } from "./studying-route-model";
import type { StudyAvailability, StudyLearnerBand } from "./study-v2-api";
export interface OwnerStudyEntryProps {
  account: AuthenticatedSession; communityId: string; postId: string;
  availability: Extract<StudyAvailability, { state: "ready" }>;
  onPractice: () => void; onExit: () => void; recorder?: StudyingRecorder;
  api?: OwnerStudyFinancialApi; store?: GuestAuthorityStore; locks?: OwnerStudyLocks;
}
export function OwnerStudyEntry(props: OwnerStudyEntryProps) {
  return <For each={[JSON.stringify([props.account.userId, props.communityId, props.postId])]}>{() => {
    const account = props.account, communityId = props.communityId, postId = props.postId;
    return <ErrorBoundary fallback={<section data-owner-study-unavailable>
      <p>Original financial recovery is unavailable in this browser. Saved operations and owed rewards remain unchanged.</p>
      <Button onClick={props.onPractice}>Ordinary practice</Button>
    </section>}><OwnerStudyEntryForAccount {...props} account={account} communityId={communityId} postId={postId} /></ErrorBoundary>;
  }}</For>;
}
function OwnerStudyEntryForAccount(props: OwnerStudyEntryProps) {
  if (props.store === undefined && typeof indexedDB === "undefined") throw new Error("Durable financial storage unavailable");
  const origin = window.location.origin;
  const rewardCopy = getLocaleMessages(usePageUiLocale(), "routes").guestStudyRewards;
  const api = props.api ?? createOwnerStudyFinancialApi({ origin });
  const previewReader = createGuestStudyRewardPreviewReader({ origin });
  const coordinator = createOwnerStudyStartCoordinator({ origin, api, store: props.store, locks: props.locks });
  const [persona, setPersona] = createSignal(""); // Never silently select the only persona.
  const [language, setLanguage] = createSignal(""), [band, setBand] = createSignal<StudyLearnerBand | "">("");
  const [preview, setPreview] = createSignal<Awaited<ReturnType<OwnerStudyFinancialApi["getRewardPreview"]>>>();
  const [disclosure, setDisclosure] = createSignal<{ version: string; text: string }>();
  const [accept, setAccept] = createSignal(false), [busy, setBusy] = createSignal(false), [message, setMessage] = createSignal("");
  const [started, setStarted] = createSignal<Extract<OwnerStudyStartResult, { status: "started" }>>();
  const [runtime, setRuntime] = createSignal<StudyingClient>();
  let active = true, generation = 0;
  onCleanup(() => { active = false; generation++; });
  const invalidate = () => { generation++; setPreview(undefined); setDisclosure(undefined); setAccept(false); };
  const review = async () => {
    if (!active || busy() || persona() === "" || (language() !== "" && band() === "")) return;
    const request = ++generation; setBusy(true); setMessage(""); setAccept(false);
    const originalPersona = persona(), originalLanguage = language(), originalBand = band();
    try {
      const [terms, publicValue] = await Promise.all([
        boundedOwnerRequest(signal => api.getRewardPreview({ path: { communityId: props.communityId, postId: props.postId },
          query: { persona_id: originalPersona, ...(originalLanguage === "" ? {} : { target_language: originalLanguage, learner_band: originalBand || undefined }) } }, signal)),
        boundedOwnerRequest(signal => previewReader.load(props.communityId, props.postId, signal)),
      ]);
      if (!active || request !== generation) return;
      if (terms.reward_terms.disclosure_version !== publicValue.prepared.disclosure.version) throw new Error("Current server disclosure differs");
      setPreview(terms); setDisclosure(publicValue.prepared.disclosure);
    } catch { if (active && request === generation) setMessage("Rewarded entry is unavailable. You can still choose account-free Guest practice or ordinary practice; no chance is promised."); }
    finally { if (active && request === generation) setBusy(false); }
  };
  const open = (value: Extract<OwnerStudyStartResult, { status: "started" }>) => {
    setStarted(value);
    if (!value.readOnlyRecovery) setRuntime(createOwnerStudyRuntimeClient({ api, store: coordinator.store, locks: coordinator.locks,
      accountId: value.namespaceAccountId, originalKey: value.originalKey, initial: value.result, readOnlyRecovery: value.readOnlyRecovery,
      onChanged: result => { if (active) setStarted(previous => previous?.result.session.session_id === result.session.session_id ? { ...previous, result } : previous); } }));
  };
  const begin = async (resume: boolean, retry = false) => {
    if (!active || busy()) return;
    const terms = preview(), providerDisclosure = disclosure();
    if (!resume && (terms === undefined || providerDisclosure === undefined || !accept() || persona() === "")) return;
    generation++; setBusy(true); setMessage("");
    try {
      const value = resume ? retry ? await coordinator.retryOriginal(props.account.userId, props.communityId, props.postId) : await coordinator.resume(props.account.userId, props.communityId, props.postId)
        : terms === undefined || providerDisclosure === undefined ? { status: "pending" as const, message: "Explicit current terms are required." }
        : await coordinator.start({ accountId: props.account.userId, communityId: props.communityId, postId: props.postId,
          acceptedTerms: terms.reward_terms, disclosureText: providerDisclosure.text, draft: { persona_id: persona(), target_language: language() || null,
            learner_band: language() === "" ? null : band() || null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            reward_preview_terms_hash: terms.reward_preview_terms_hash, disclosure: { version: providerDisclosure.version, accepted: true } } });
      if (!active) return;
      if (value.status === "started") open(value); else setMessage(value.message);
    } catch { if (active) setMessage("The original request remains unresolved. Resume its original key before another entry."); }
    finally { if (active) setBusy(false); }
  };
  return <Show when={started()} fallback={<section class="flex flex-col gap-3" data-owner-study-consent>
    <h2>Optional original-drawing entry</h2>
    <p>Practice stays available. A chance requires the actual offered terms, a qualifying lesson and committed admission; lesson completion alone is not a purchased entry.</p>
    <OperationPersonaControl label="Studying as" placeholder="Choose your Study persona" selectedPersonaId={persona()}
      personas={toOperationPersonas(communityOperationPersonas(props.account.personas, props.communityId))}
      onSelect={id => { setPersona(id); invalidate(); }} disabled={busy()} />
    <Show when={communityOperationPersonas(props.account.personas, props.communityId).length === 1}>{() => {
      const sole = communityOperationPersonas(props.account.personas, props.communityId)[0];
      return <Button disabled={busy() || sole === undefined} onClick={() => { if (sole !== undefined) { setPersona(sole.personaId); invalidate(); } }}>Use {sole?.displayName} for this entry</Button>;
    }}</Show>
    <select aria-label="Helper language for rewarded Study" value={language()} disabled={busy()} onChange={event => { setLanguage(event.currentTarget.value); setBand(""); invalidate(); }}>
      <option value="">Original lyrics</option><ForLanguages languages={props.availability.target_languages} />
    </select>
    <Show when={language() !== ""}><select aria-label="Learner level for rewarded Study" value={band()} disabled={busy()} onChange={event => { setBand(props.availability.learner_bands.find(v => v === event.currentTarget.value) ?? ""); invalidate(); }}>
      <option value="">Choose a level</option><ForBands bands={props.availability.learner_bands} />
    </select></Show>
    <Button disabled={busy() || persona() === ""} onClick={() => void review()}>Review actual chance terms</Button>
    <Show when={preview()}>{value => <p>Original drawing {value().reward_terms.original_drawing_id}; cutoff {value().reward_terms.entry_cutoff_at}. A share or payout is not guaranteed.</p>}</Show>
    <Show when={disclosure()}>{value => <label data-owner-study-disclosure><input type="checkbox" checked={accept()} disabled={busy()} onChange={event => setAccept(event.currentTarget.checked)} />{value().text} I accept these original chance terms and this recording disclosure.</label>}</Show>
    <Button disabled={busy() || !accept()} onClick={() => void begin(false)}>Start with accepted original terms</Button>
    <Button disabled={busy()} onClick={() => void begin(true)}>Resume original entry</Button>
    <Button disabled={busy()} onClick={() => void begin(true, true)}>Retry only a confirmed unstarted original</Button>
    <Button disabled={busy()} onClick={props.onPractice}>Ordinary practice</Button>
    <Show when={message()}><p role="status">{message()}</p></Show>
  </section>}>{value => <>
    <p role="status">Original drawing {value().result.reward_terms.original_drawing_id}: {rewardCopy.statuses[guestParticipationStatus(value().result.participation)]}.</p>
    <Show when={!value().readOnlyRecovery && runtime() !== undefined} fallback={<section data-owner-study-read-only-recovery>
      <p>Your original lesson is recovered read-only. Missing or unresolved answer metadata cannot authorize a new answer.</p>
      <p>{value().result.session.lesson.resolved_card_count} / {value().result.session.lesson.total_card_count} cards.</p><Button onClick={props.onExit}>Exit</Button>
    </section>}>
      <Show when={runtime()}>{client => <StudyingRouteView postId={props.postId} client={client()} recorder={props.recorder} onExit={props.onExit}
        recoveryPresentation={{ disclosure: value().disclosure, disclosureAccepted: true, noDisclosureDescription: "Current recording disclosure is unavailable.", exitLabel: "Exit",
          practiceLabel: `Original drawing ${value().result.reward_terms.original_drawing_id}`, pendingTitle: "Original answer pending",
          pendingDescription: "Keep the original audio/choice, item, attempt and key. Reload cannot authorize a replacement answer.", retryOriginalLabel: "Retry original request",
          authorityDescription: "Restore your ordinary Account session before retrying the same request.", onRecoverAccess: async () => {
            if (!await requestGlobalSignInCompletion()) throw new Error("Ordinary Account recovery unresolved");
          } }} />}</Show>
    </Show>
    <OwnerStudyRecoveryControls finance={api} store={coordinator.store} locks={coordinator.locks} />
  </>}</Show>;
}
function ForLanguages(props: { languages: readonly string[] }) { return <For each={props.languages}>{language => <option value={language}>{language}</option>}</For>; }
function ForBands(props: { bands: readonly StudyLearnerBand[] }) { return <For each={props.bands}>{band => <option value={band}>{band}</option>}</For>; }

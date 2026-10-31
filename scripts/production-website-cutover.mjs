import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ACCOUNT, API_APP_SOURCE, APP_REPO, APP_SOURCE, CONFIG_PATH, EXECUTOR, NODE, WORKER, WRANGLER_BIN } from "./production-website/paths.mjs";
import { candidateIdentity, accepted, digest, digestString, hash, validateAttemptIdentity, validateCommandLineage, validateReadbackIdentity } from "./production-website/contract.mjs";
import { preparedCandidate, criticalAssets } from "./production-website/candidate.mjs";
import { assertWholeSourcePins, loadApiContext } from "./production-website/context.mjs";
import { bindingProposal, comparable, expectedDeployment, normalizedSettings } from "./production-website/bindings.mjs";
import { backendHttpReadbackName, nextWebsiteNames, validateContinuation, validateProbeSelection, validateWebsiteBinding, validateWebsitePhaseFacts } from "./production-website/lifecycle.mjs";
import { collectWebsite, verifyServing } from "./production-website/provider.mjs";

const self = () => hash(readFileSync(EXECUTOR));
let phase = "source";
function referenceBytes(reference) {
  assert.ok(reference && isAbsolute(reference.path)); digestString(reference.sha256);
  assert.equal(realpathSync(reference.path), resolve(reference.path));
  const bytes = readFileSync(reference.path); assert.equal(hash(bytes), reference.sha256); return bytes;
}
const referenceJson = reference => JSON.parse(referenceBytes(reference).toString("utf8"));

function wholeInputs(api, authorization, candidate) {
  const { review, admission } = authorization;
  assertWholeSourcePins(review, api.pins); assert.equal(review.website_executor_sha256, self());
  assert.equal(review.website_source, APP_SOURCE); assert.equal(review.api_source, API_APP_SOURCE);
  assert.deepEqual(review.website_candidate_identity, candidateIdentity(candidate));
  api.admission.assertReviewedBinding(review.website_bindings);
  const derivation = referenceJson(review.website_bindings.candidate_settings_derivation); accepted(derivation);
  assert.deepEqual(derivation.normalized_candidate_settings, normalizedSettings(derivation.normalized_candidate_settings));
  criticalAssets(candidate, review.website_critical_assets);
  for (const [name, field] of [["website_predeploy_phone", "phone_acceptance_sha256"], ["website_disclosure", "disclosure_sha256"], ["website_public_legal_source", "public_legal_source_sha256"]]) {
    assert.equal(review[name].sha256, admission[field]); referenceBytes(review[name]);
  }
  return review;
}
function phaseFacts(api, authorization) {
  const { review, admission } = authorization;
  validateWebsitePhaseFacts({ cors: referenceJson(review.website_cors_readiness), phone: referenceJson(review.website_predeploy_phone), admission,
    apiSource: API_APP_SOURCE, appSource: APP_SOURCE, httpReadbackSha: api.evidence.recordDigest(backendHttpReadbackName(review)) });
}
function selectedAttempt(api, review) {
  let selected = nextWebsiteNames();
  const continuations = review.website_continuations ?? [];
  assert.ok(Array.isArray(continuations) && continuations.length <= 4, "Unbounded website continuation");
  for (const continuation of continuations) {
    assert.ok(api.evidence.record(selected.attempt), "Website continuation has no predecessor attempt");
    const predecessor = api.evidence.recordDigest(selected.attempt);
    validateContinuation(continuation, predecessor, api.evidence.resolution(selected.key, selected.attempt, review)?.conclusion);
    selected = nextWebsiteNames(predecessor);
  }
  return selected;
}
function acceptedRecord(api, row, review, label) {
  api.evidence.acceptedExecutor(row, self(), review, label); return true;
}
function attemptedProposal(api, attempt, selected, review, candidate) {
  validateAttemptIdentity(attempt, candidateIdentity(candidate), acceptedRecord(api, attempt, review, selected.attempt));
  assert.equal(digest(comparable(attempt.before)), attempt.before_sha256);
  const resolved = api.evidence.resolution(selected.key, selected.attempt, review);
  assert.notEqual(resolved?.conclusion, "baseline_unchanged", "Reviewed website abort; explicit continuation required");
  assert.ok(!resolved || resolved.conclusion === "candidate_verified", "Unsupported website resolution conclusion");
  let proposal = attempt.proposal;
  if (resolved?.conclusion === "candidate_verified") {
    assert.deepEqual(resolved.candidate_identity, candidateIdentity(candidate));
    const settings = referenceJson(review.website_bindings.candidate_settings_derivation).normalized_candidate_settings;
    const anticipated = expectedDeployment(attempt.before, candidate.config);
    assert.equal(settings.compatibility_date, candidate.config.compatibility_date);
    assert.deepEqual([...(settings.compatibility_flags ?? [])].sort(), [...candidate.config.compatibility_flags].sort());
    const corrected = { ...anticipated, settings };
    proposal = { ...proposal, candidate: corrected, candidate_sha256: digest(corrected), candidate_settings_sha256: digest(settings) };
  }
  validateWebsiteBinding(proposal, review.website_bindings);
  const anticipated = expectedDeployment(attempt.before, candidate.config);
  for (const key of ["bindings", "runtime", "domains", "subdomain"]) assert.deepEqual(proposal.candidate[key], anticipated[key]);
  assert.deepEqual(proposal.candidate.settings, referenceJson(review.website_bindings.candidate_settings_derivation).normalized_candidate_settings);
  assert.equal(digest(proposal.candidate), proposal.candidate_sha256);
  validateProbeSelection(attempt.critical_assets, criticalAssets(candidate, review.website_critical_assets), resolved);
  return proposal;
}

/** Fixed production orchestration. No provider, state, source or executor can be injected by CLI. */
export async function main(args = process.argv.slice(2)) {
  assert.equal(args.length, 1); const mode = args[0]; assert.ok(["snapshot", "apply", "reconcile"].includes(mode));
  phase = "verified_source_context"; const api = await loadApiContext();
  phase = "prepared_artifact"; const candidate = await preparedCandidate();
  if (mode === "snapshot") {
    phase = "provider_snapshot"; const before = await collectWebsite();
    return { kind: "ordinary-website-readonly-snapshot-v1", at: new Date().toISOString(), read_only: true, writes: 0,
      worker: WORKER, pins: api.pins, candidate_identity: candidateIdentity(candidate), candidate_module_count: candidate.modules.length,
      uploader_inputs: candidate.uploader_inputs, candidate_client_inventory: candidate.client, before, proposal: bindingProposal(before, candidate.config),
      remote_full_asset_membership_proven: false, evidence: api.evidence.evidenceDiagnostics() };
  }
  phase = "whole_release_admission";
  const authorization = api.admission.admitted(mode, self(), mode === "apply");
  const review = wholeInputs(api, authorization, candidate), selected = selectedAttempt(api, review);
  const attempt = api.evidence.record(selected.attempt), existing = api.evidence.record(selected.readback), command = api.evidence.record(selected.command);
  assert.ok(attempt || (!existing && !command), "Website downstream evidence lacks attempt");
  if (attempt) {
    const proposal = attemptedProposal(api, attempt, selected, review, candidate);
    if (command) validateCommandLineage(command, api.evidence.recordDigest(selected.attempt), acceptedRecord(api, command, review, selected.command));
    if (existing) validateReadbackIdentity(existing, api.evidence.recordDigest(selected.attempt), candidateIdentity(candidate), acceptedRecord(api, existing, review, selected.readback));
    phase = "read_only_reconciliation"; const after = await verifyServing(candidate, proposal, review.website_critical_assets);
    const urls = await api.database.managedUrls(); await api.database.ownerRead(urls.owner, 333);
    const afterSource = await loadApiContext(); assertWholeSourcePins(review, afterSource.pins);
    assert.deepEqual(candidateIdentity(await preparedCandidate()), candidateIdentity(candidate));
    const finalAdmission = api.admission.admitted("reconcile", self(), false, 0);
    assert.equal(finalAdmission.reviewSha, authorization.reviewSha); assert.equal(finalAdmission.admissionSha, authorization.admissionSha);
    const result = { kind: "ordinary-website-upload-readback-v1", at: new Date().toISOString(), accepted: true, reconciled: true,
      original_command_receipt: command ? { sha256: api.evidence.recordDigest(selected.command) } : null,
      new_upload: false, executor_sha256: self(), attempt_sha256: api.evidence.recordDigest(selected.attempt), candidate_identity: candidateIdentity(candidate), after };
    if (!existing) api.evidence.save(selected.readback, result);
    api.evidence.save(selected.key + "-reconciled-" + Date.now() + ".json", result);
    return { accepted: true, reconciled: true, new_upload: false, version: after.version, attempt_sha256: result.attempt_sha256 };
  }
  assert.notEqual(mode, "reconcile", "No website upload attempt exists; snapshot remains available");
  phase = "backend_and_phase_gates";
  api.backend.assertWebsiteBackendPrerequisites(review); phaseFacts(api, authorization); api.admission.checkBackup(review);
  const urls = await api.database.managedUrls(); await api.database.ownerRead(urls.owner, 333);
  const before = await collectWebsite(), proposal = bindingProposal(before, candidate.config);
  assert.equal(before.latest_upload_is_serving, true, "Latest upload is not the reviewed serving baseline");
  validateWebsiteBinding(proposal, review.website_bindings);
  assert.deepEqual(proposal.candidate.settings, referenceJson(review.website_bindings.candidate_settings_derivation).normalized_candidate_settings);
  // Managed credentials are obtained before the once marker. Uncertain command results are never replayed.
  await api.provider.managedToken();
  phase = "immediate_preupload_recheck";
  const rechecked = await loadApiContext(); assertWholeSourcePins(review, rechecked.pins);
  assert.deepEqual(candidateIdentity(await preparedCandidate()), candidateIdentity(candidate));
  assert.deepEqual(await collectWebsite(), before);
  const last = api.admission.admitted("apply", self(), true);
  assert.equal(last.reviewSha, authorization.reviewSha); assert.equal(last.admissionSha, authorization.admissionSha);
  wholeInputs(api, last, candidate); api.backend.assertWebsiteBackendPrerequisites(last.review); phaseFacts(api, last); api.admission.checkBackup(last.review);
  phase = "upload_attempt";
  api.evidence.save(selected.attempt, { kind: "ordinary-website-upload-attempt-v1", at: new Date().toISOString(), executor_sha256: self(),
    admission_sha256: authorization.admissionSha, review_sha256: authorization.reviewSha, source_pins: api.pins,
    candidate_identity: candidateIdentity(candidate), before, before_sha256: digest(comparable(before)),
    critical_assets: criticalAssets(candidate, review.website_critical_assets), proposal });
  const output = await api.commands.runDeploymentCommand([NODE, WRANGLER_BIN, "deploy", "--config", CONFIG_PATH, "--message", "git:" + APP_SOURCE],
    APP_REPO, AbortSignal.timeout(150_000), { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT });
  const receipt = { kind: "ordinary-website-deployment-command-result-v1", at: new Date().toISOString(), executor_sha256: self(),
    attempt_sha256: api.evidence.recordDigest(selected.attempt), exit_code: output.exitCode,
    stdout_sha256: hash(output.stdout), stderr_sha256: hash(output.stderr), provider_output_emitted: false };
  api.evidence.save(selected.command, receipt); assert.equal(receipt.exit_code, 0, "Website command refused or unresolved; preserve attempt");
  phase = "provider_and_served_asset_readback"; const after = await verifyServing(candidate, proposal, review.website_critical_assets);
  await api.database.ownerRead(urls.owner, 333);
  const finalSource = await loadApiContext(); assertWholeSourcePins(review, finalSource.pins);
  assert.deepEqual(candidateIdentity(await preparedCandidate()), candidateIdentity(candidate));
  const finalAdmission = api.admission.admitted("reconcile", self(), false, 0);
  assert.equal(finalAdmission.reviewSha, authorization.reviewSha); assert.equal(finalAdmission.admissionSha, authorization.admissionSha);
  const result = { kind: "ordinary-website-upload-readback-v1", at: new Date().toISOString(), accepted: true, reconciled: false,
    executor_sha256: self(), attempt_sha256: api.evidence.recordDigest(selected.attempt), candidate_identity: candidateIdentity(candidate),
    original_command_receipt: { sha256: api.evidence.recordDigest(selected.command) }, after };
  api.evidence.save(selected.readback, result);
  return { accepted: true, new_upload: true, version: after.version, attempt_sha256: result.attempt_sha256 };
}

if (import.meta.main) main().then(value => console.log(JSON.stringify(value))).catch(() => {
  console.error(JSON.stringify({ success: false, phase, message: "Website operation refused or unresolved. Preserve evidence; snapshot remains available. Provider output and credentials withheld." }));
  process.exitCode = 1;
});

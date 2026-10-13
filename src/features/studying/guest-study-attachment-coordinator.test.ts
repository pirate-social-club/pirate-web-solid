import { ApiClientError } from "@pirate/api-client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createPageGuestAuthorityStore } from "./guest-authority-selection";
import type { GuestStudyApi } from "./guest-study-api";
import type { GuestStudyAccountingApi, GuestAttachmentPrepared } from "./guest-study-accounting-api";
import { createGuestStudyAttachmentCoordinator } from "./guest-study-attachment-coordinator";
const origin = "https://app.pirate.test";
const target: GuestAttachmentPrepared = { intent_id: `gai_${"C".repeat(21)}A`, target_revision: 1, state: "awaiting_confirmation", account_confirmation: { account_id: "account", display_name: "Actual account" } };
async function fixture() {
  const store = createPageGuestAuthorityStore();
  await store.update(j => { j.pointer = { origin, owner_id: "owner", credential_id: "credential", last_start_key: "old-uncertain-start" }; });
  const guest = { createAttachmentIntent: vi.fn<GuestStudyApi["createAttachmentIntent"]>().mockResolvedValue({ intent_id: target.intent_id, state: "awaiting_account", expires_at: "2026-10-14T10:00:00.000Z" }) };
  const accounting = { prepareAttachment: vi.fn<GuestStudyAccountingApi["prepareAttachment"]>().mockResolvedValue(target),
    getAttachment: vi.fn<GuestStudyAccountingApi["getAttachment"]>().mockRejectedValue(new Error("Unresolved original confirmation")),
    confirmAttachment: vi.fn<GuestStudyAccountingApi["confirmAttachment"]>().mockResolvedValue({ attachment_id: target.intent_id, owner_id: "owner", account_id: "account", state: "bound", bound_at: "2026-10-14T09:00:00.000Z" }) };
  let tail = Promise.resolve(), keys = 0, selected: string | null = "credential";
  const locks = { exclusive: <T>(work: () => Promise<T>) => { const next = tail.then(work); tail = next.then(() => undefined, () => undefined); return next; } };
  const create = () => createGuestStudyAttachmentCoordinator({ origin, ownerId: "owner", credentialId: () => selected, guest, accounting, store, locks, key: () => `original-${++keys}` });
  return { store, guest, accounting, create, select: (value: string | null) => { selected = value; } };
}
describe("initiating-origin signup preserves original participation", () => {
  beforeEach(() => vi.stubGlobal("location", { origin }));
  afterEach(() => vi.unstubAllGlobals());
  test("commits original intent key before IO; timeout/reload uses exact same key", async () => {
    const f = await fixture();
    f.guest.createAttachmentIntent.mockImplementationOnce(async input => {
      expect((await f.store.read()).attachment?.key).toBe(input.body.idempotency_key);
      throw new Error("Lost original COMMIT");
    });
    expect(await f.create().begin()).toEqual({ status: "pending" });
    expect((await f.store.read()).pointer?.last_start_key).toBe("old-uncertain-start");
    expect(await f.create().begin()).toMatchObject({ status: "awaiting_account" });
    expect(f.guest.createAttachmentIntent.mock.calls[0]?.[0]).toEqual(f.guest.createAttachmentIntent.mock.calls[1]?.[0]);
  });
  test("prepare alone never binds; explicit account confirmation commits target before POST", async () => {
    const f = await fixture(), flow = f.create();
    await flow.begin(); await flow.prepare(); expect(f.accounting.confirmAttachment).not.toHaveBeenCalled();
    f.accounting.confirmAttachment.mockImplementationOnce(async input => {
      const saved = (await f.store.read()).attachment;
      expect(saved?.confirmationSubmitted).toBe(true);
      expect(input.body).toEqual({ target_revision: saved?.target?.target_revision, expected_account_id: saved?.target?.account_confirmation.account_id });
      throw new Error("Unknown confirmation COMMIT");
    });
    expect(await flow.confirm(target)).toEqual({ status: "pending" });
    f.accounting.prepareAttachment.mockResolvedValue({ ...target, target_revision: 2, account_confirmation: { account_id: "different", display_name: null } });
    const reloaded = f.create(); expect(await reloaded.prepare()).toEqual({ status: "awaiting_confirmation", target });
    expect(f.accounting.prepareAttachment).toHaveBeenCalledOnce();
    expect(await reloaded.confirm({ ...target, account_confirmation: { account_id: "different", display_name: null } })).toEqual({ status: "unavailable" });
    expect(f.accounting.confirmAttachment).toHaveBeenCalledOnce();
    expect(await reloaded.confirm(target)).toMatchObject({ status: "bound", binding: { owner_id: "owner", account_id: "account" } });
    expect(f.accounting.confirmAttachment.mock.calls[0]?.[0]).toEqual(f.accounting.confirmAttachment.mock.calls[1]?.[0]);
    expect((await f.store.read()).pointer?.last_start_key).toBe("old-uncertain-start");
  });
  test("foreign ceremony binding is never durably accepted from confirm or Account replay", async () => {
    const f = await fixture(), flow = f.create(); await flow.begin(); await flow.prepare();
    const foreign = { attachment_id: `gai_${"D".repeat(21)}A`, owner_id: "owner", account_id: "account", state: "bound" as const, bound_at: "2026-10-14T09:00:00.000Z" };
    f.accounting.confirmAttachment.mockResolvedValueOnce(foreign);
    expect(await flow.confirm(target)).toEqual({ status: "pending" });
    expect((await f.store.read()).attachment?.binding).toBeNull();
    f.accounting.getAttachment.mockResolvedValueOnce(foreign); f.select(null);
    expect(await f.create().begin()).toEqual({ status: "pending" });
    expect((await f.store.read()).attachment?.binding).toBeNull();
    expect(f.accounting.confirmAttachment).toHaveBeenCalledOnce(); expect(f.guest.createAttachmentIntent).toHaveBeenCalledOnce();
  });
  test("lost successful confirmation recovers account-only before revoked Guest proof and missing pointer gates", async () => {
    const f = await fixture(), flow = f.create(); await flow.begin(); await flow.prepare();
    f.accounting.confirmAttachment.mockImplementationOnce(async () => { f.select(null); throw new Error("Original COMMIT accepted; response lost; Guest proof revoked"); });
    expect(await flow.confirm(target)).toEqual({ status: "pending" });
    await f.store.update(j => { j.pointer = null; });
    const originalBinding = { attachment_id: target.intent_id, owner_id: "owner", account_id: "account", state: "bound" as const, bound_at: "2026-10-14T09:00:00.000Z" };
    f.accounting.getAttachment.mockResolvedValueOnce(originalBinding);
    expect(await f.create().prepare()).toEqual({ status: "bound", binding: originalBinding });
    expect(f.accounting.getAttachment.mock.calls[0]?.[0]).toEqual({ path: { id: target.intent_id } });
    expect((await f.store.read()).attachment?.binding).toEqual(originalBinding);
    expect(f.accounting.confirmAttachment).toHaveBeenCalledOnce(); expect(f.accounting.prepareAttachment).toHaveBeenCalledOnce(); expect(f.guest.createAttachmentIntent).toHaveBeenCalledOnce();
  });
  test("Account-only404 and timeout preserve unknown original confirmation; never create another intent or target", async () => {
    const f = await fixture(), flow = f.create(); await flow.begin(); await flow.prepare();
    f.accounting.confirmAttachment.mockRejectedValueOnce(new Error("Original COMMIT unresolved")); await flow.confirm(target); f.select(null);
    const original = (await f.store.read()).attachment;
    f.accounting.getAttachment.mockRejectedValueOnce(new ApiClientError({ name: "NotFound", status: 404, code: "not_found", retryable: false }, { error: { code: "not_found", message: "Not found", retryable: false } }));
    expect(await f.create().begin()).toEqual({ status: "pending" });
    f.accounting.getAttachment.mockRejectedValueOnce(new Error("Read timeout"));
    expect(await f.create().prepare()).toEqual({ status: "pending" });
    expect((await f.store.read()).attachment).toEqual(original);
    expect(f.accounting.confirmAttachment).toHaveBeenCalledOnce(); expect(f.accounting.prepareAttachment).toHaveBeenCalledOnce(); expect(f.guest.createAttachmentIntent).toHaveBeenCalledOnce();
  });
  test("origin change never forwards guest ownership or creates another ceremony", async () => {
    const f = await fixture(); await f.create().begin();
    vi.stubGlobal("location", { origin: "https://name.pirate.test" });
    expect(await f.create().prepare()).toEqual({ status: "pending" });
    expect(f.accounting.prepareAttachment).not.toHaveBeenCalled(); expect(f.guest.createAttachmentIntent).toHaveBeenCalledOnce();
  });
  test("unavailable native persistence/locks never creates a financial recovery request", async () => {
    vi.stubGlobal("indexedDB", undefined); vi.stubGlobal("navigator", {});
    const f = await fixture();
    const flow = createGuestStudyAttachmentCoordinator({ origin, ownerId: "owner", credentialId: () => "credential", guest: f.guest, accounting: f.accounting });
    expect(await flow.begin()).toEqual({ status: "unavailable" }); expect(f.guest.createAttachmentIntent).not.toHaveBeenCalled();
  });
});

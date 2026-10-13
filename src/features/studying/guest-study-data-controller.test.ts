import { expect, test, vi } from "vitest";
import type { DeleteGuestLearnerAudioResponse } from "@pirate/api-client";
import { createGuestStudyDataController, type GuestDataApi } from "./guest-study-data-controller";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const scope = { ownerId: "owner-original", credentialId: "credential-original" };
  const api = {
    setLearningRetention: vi.fn<GuestDataApi["setLearningRetention"]>(async () => ({ mode: "ephemeral" as const, effective_at: "2026-10-13T12:00:00.000Z" })),
    deleteLearnerAudio: vi.fn<GuestDataApi["deleteLearnerAudio"]>(),
  };
  let serial = 0;
  const changed = vi.fn();
  const controller = createGuestStudyDataController({ api, scope: () => scope, key: () => `operation-${++serial}`, changed });
  return { controller, api, scope, changed };
}
function deletion(key: string, state: "pending" | "completed", provider: "pending" | "unknown" | "deletion_confirmed"): DeleteGuestLearnerAudioResponse {
  return { state, deleted_count: state === "pending" ? 1 : 2, remaining_count: state === "pending" ? 1 : 0,
    operation: { operation_kind: "learner_audio_deletion", idempotency_key: key, operation_id: "operation-server" },
    provider_disposition: provider };
}

test("does not infer current retention and retries an uncertain SET with its original body/key", async () => {
  const { controller, api, scope } = fixture();
  expect(controller.state.retention).toBeNull();
  expect(api.setLearningRetention).not.toHaveBeenCalled();
  api.setLearningRetention.mockRejectedValueOnce(new Error("response lost"));
  await controller.setRetention("ephemeral");
  expect(controller.state.retentionStatus).toBe("uncertain");
  await controller.setRetention("private_learning");
  expect(api.setLearningRetention).toHaveBeenCalledTimes(1);
  scope.credentialId = "confirmed-successor";
  await controller.setRetention("ephemeral");
  expect(api.setLearningRetention.mock.calls[0]?.[0]?.body).toEqual(api.setLearningRetention.mock.calls[1]?.[0]?.body);
  expect(api.setLearningRetention.mock.calls[1]?.[0]?.headers).toEqual({ "x-guest-credential-id": "confirmed-successor" });
  expect(controller.state.retentionStatus).toBe("confirmed");
});

test("does not label pending deletion or unknown provider disposition as erased", async () => {
  const { controller, api } = fixture();
  api.deleteLearnerAudio.mockResolvedValueOnce(deletion("operation-1", "pending", "pending"));
  api.deleteLearnerAudio.mockResolvedValueOnce(deletion("operation-1", "completed", "unknown"));
  await controller.deleteAudio();
  expect(controller.state.deletionStatus).toBe("pending");
  await controller.deleteAudio();
  expect(api.deleteLearnerAudio.mock.calls[0]?.[0]).toEqual(api.deleteLearnerAudio.mock.calls[1]?.[0]);
  expect(controller.state.deletion?.provider_disposition).toBe("unknown");
  expect(controller.state.deletionStatus).toBe("completed");
  api.deleteLearnerAudio.mockResolvedValueOnce(deletion("operation-2", "completed", "deletion_confirmed"));
  await controller.deleteAudio();
  expect(api.deleteLearnerAudio.mock.calls[2]?.[0]).toMatchObject({ headers: { "idempotency-key": "operation-2" } });
});

test("uncertain DELETE retries the same key and concurrent clicks do not mint another command", async () => {
  const { controller, api } = fixture();
  const pending = deferred<DeleteGuestLearnerAudioResponse>();
  api.deleteLearnerAudio.mockReturnValueOnce(pending.promise);
  const first = controller.deleteAudio();
  await controller.deleteAudio();
  expect(api.deleteLearnerAudio).toHaveBeenCalledTimes(1);
  pending.resolve(deletion("operation-1", "pending", "pending"));
  await first;
  api.deleteLearnerAudio.mockRejectedValueOnce(new Error("response lost"));
  await controller.deleteAudio();
  expect(controller.state.deletionStatus).toBe("uncertain");
  api.deleteLearnerAudio.mockResolvedValueOnce(deletion("operation-1", "completed", "deletion_confirmed"));
  await controller.deleteAudio();
  expect(api.deleteLearnerAudio.mock.calls.map(([call]) => call)).toEqual([
    api.deleteLearnerAudio.mock.calls[0]?.[0], api.deleteLearnerAudio.mock.calls[0]?.[0], api.deleteLearnerAudio.mock.calls[0]?.[0],
  ]);
});

test.each(["dispose", "owner-switch"])("ignores late responses after %s", async (action) => {
  const { controller, api, scope, changed } = fixture();
  const pending = deferred<DeleteGuestLearnerAudioResponse>();
  api.deleteLearnerAudio.mockReturnValueOnce(pending.promise);
  const request = controller.deleteAudio();
  const calls = changed.mock.calls.length;
  if (action === "dispose") controller.dispose();
  else scope.ownerId = "owner-other";
  pending.resolve(deletion("operation-1", "completed", "deletion_confirmed"));
  await request;
  expect(changed.mock.calls).toHaveLength(calls);
  expect(controller.state.deletion).toBeNull();
});

test("refuses a server response identifying another operation", async () => {
  const { controller, api } = fixture();
  api.deleteLearnerAudio.mockResolvedValueOnce(deletion("wrong-operation", "completed", "deletion_confirmed"));
  await controller.deleteAudio();
  expect(controller.state.deletionStatus).toBe("uncertain");
  expect(controller.state.deletion).toBeNull();
});

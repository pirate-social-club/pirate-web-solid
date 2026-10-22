import { decodeContributionCommand } from "./contribution-command-codec.ts";
import type { createSongContributionJournal, StoredContributionCommand } from "./song-contribution-journal.ts";
import type { SongContributionApi } from "./song-contributions.ts";
import { ContributionCreationRefused } from "./song-contribution-refusal.ts";

export type ContributionJournal = ReturnType<typeof createSongContributionJournal>;
export type ContributionJournalHandle = Parameters<Parameters<ContributionJournal["exclusive"]>[0]>[0];
type ClaimDelivery = Awaited<ReturnType<SongContributionApi["claim"]>>;
type Receipt = NonNullable<Awaited<ReturnType<SongContributionApi["command"]>>>;

/** Look up the original command first. A recovered claim is never a fresh
 * signing grant. Only an explicit action may resend these same command bytes. */
export async function resolveContributionCommand(options: {
  readonly handle: ContributionJournalHandle;
  readonly stored: StoredContributionCommand;
  readonly api: SongContributionApi;
  readonly signal: AbortSignal;
  readonly allowWrite: boolean;
  readonly assertCurrent: () => void;
}): Promise<{ readonly kind: "receipt"; readonly receipt: Receipt; readonly freshClaim: ClaimDelivery | null } | { readonly kind: "refused" } | null> {
  const { handle, stored, api, signal, assertCurrent } = options;
  const command = decodeContributionCommand(stored.operation, stored.bodyJson), key = command.body.idempotency_key;
  assertCurrent();
  try {
  let receipt = await api.command(command.operation, key, signal, stored.contributionId ?? undefined);
  assertCurrent();
  let freshClaim: ClaimDelivery | null = null;
  if (receipt === null) {
    // An acknowledged command disappearing is not permission to recreate it.
    if (stored.requestHash !== null) throw new Error("contribution_command_missing");
    if (!options.allowWrite) return null;
    const id = stored.contributionId;
    switch (command.operation) {
      case "CreateSongMegapotContributionV2": receipt = await api.create(command.body, signal); break;
      case "ClaimSongMegapotContributionSubmissionV2": {
        if (!id) throw new Error("contribution_original_target_required");
        const delivery = await api.claim(id, command.body, signal);
        receipt = delivery.receipt;
        if (delivery.delivery.kind === "fresh_grant" && !delivery.delivery.replayed) freshClaim = delivery;
        break;
      }
      case "ObserveSongMegapotContributionV2": if (!id) throw new Error("contribution_original_target_required"); receipt = await api.observe(id, command.body, signal); break;
      case "RecoverSongMegapotContributionV2": if (!id) throw new Error("contribution_original_target_required"); receipt = await api.recover(id, command.body, signal); break;
      case "PrepareSongMegapotContributionCancellationV2": if (!id) throw new Error("contribution_original_target_required"); receipt = await api.cancellation(id, command.body, signal); break;
    }
    assertCurrent();
  }
  handle.acknowledge(key, receipt.request_hash, receipt.object === "song_megapot_contribution_command_receipt" ? receipt : undefined);
  return { kind: "receipt", receipt, freshClaim };
  } catch (error) {
    if (!(error instanceof ContributionCreationRefused) || command.operation !== "CreateSongMegapotContributionV2") throw error;
    assertCurrent();
    await handle.archiveRefusedCreation(error.proof);
    assertCurrent();
    return { kind: "refused" };
  }
}

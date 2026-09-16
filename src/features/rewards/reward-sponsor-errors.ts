export function sponsorFailure(error: unknown): string {
  const reason = error instanceof Error ? error.message : "";
  switch (reason) {
    case "reward_creation_recovery_required": return "A saved creation already exists. Resume that reward to continue.";
    case "reward_creation_recovery_corrupt": return "The saved creation cannot be read. Keep this browser's data and contact support; a reward may already exist.";
    case "reward_creation_recovery_unavailable": return "This browser cannot save recovery information. Keep any existing attempt and check with support before funding.";
    case "reward_creation_actor_changed": case "funding_actor_changed": case "funding_account_changed": return "The account or persona changed. Close rewards and reopen with the intended persona.";
    case "wallet_reauthentication_required": return "Wallet authorization expired. Confirm access again before reviewing a transfer.";
    case "wallet_wrong_chain": return "The assigned wallet must use Base Sepolia.";
    case "wallet_assignment_mismatch": return "The wallet does not match this persona's assigned wallet.";
    case "wallet_insufficient_token_balance": return "This persona's wallet does not have enough of the selected token.";
    case "wallet_insufficient_gas_balance": return "This persona's wallet needs more testnet ETH for fees.";
    case "wallet_fee_changed": return "The fee increased. Update the fee estimate and review it before confirming.";
    case "funding_terms_changed": return "Funding instructions changed. Check the status before reviewing again.";
    case "verification_unavailable": case "wallet_auth_unavailable": return "Wallet authorization is unavailable. Your saved creation can be resumed later.";
    case "reward_creation_csrf_required": return "Sign in again, then resume your saved reward.";
    case "reward_creation_offer_conflict": return "Another reward offer already exists for this song. No transfer was attempted; reopen rewards to join that offer.";
    default: return "This step could not be completed. Keep your saved attempt and check its status before continuing.";
  }
}

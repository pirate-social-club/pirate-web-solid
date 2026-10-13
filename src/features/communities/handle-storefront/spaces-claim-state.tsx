export type SpacesClaimDisplay = {
  readonly state: "issuance_pending" | "issued" | "issuance_failed";
  readonly delayed: boolean;
  readonly display_identifier: string;
  readonly grant: { readonly status: "active" | "revoked" | "tombstoned" } | null;
};

export function spacesClaimStatus(claim: SpacesClaimDisplay) {
  if (claim.state === "issued") {
    if (claim.grant?.status === "active") {
      return { title: `${claim.display_identifier} is registered`, detail: "Your name is ready to use." };
    }
    if (claim.grant?.status === "revoked") {
      return { title: "Name grant revoked", detail: "Pirate's grant for this name has been revoked. This does not change ownership of the native Spaces name." };
    }
    if (claim.grant?.status === "tombstoned") {
      return { title: "Name grant removed", detail: "Pirate's grant for this name has been removed. This does not change ownership of the native Spaces name." };
    }
    return { title: "Grant status unavailable", detail: "This name is registered, but its current Pirate grant status is unavailable. Refresh status to check again." };
  }
  if (claim.state === "issuance_failed") {
    return { title: "Registration needs attention", detail: "This name could not be registered. Contact the community owner before requesting it again." };
  }
  return { title: "Registration pending", detail: claim.delayed
    ? "Registration is taking longer than expected. Only you can see this requested name while it is pending."
    : "Only you can see this requested name until its Bitcoin registration is final." };
}

export function SpacesClaimStateCard(props: { readonly claim: SpacesClaimDisplay }) {
  const display = () => spacesClaimStatus(props.claim);
  return <div data-spaces-claim-state={props.claim.state} role="status">
    <h2 class="font-semibold">{display().title}</h2>
    <p>{display().detail}</p>
  </div>;
}

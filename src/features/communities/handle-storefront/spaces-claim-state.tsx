export type SpacesClaimDisplay = {
  readonly state: "issuance_pending" | "issued" | "issuance_failed";
  readonly delayed: boolean;
  readonly display_identifier: string;
  readonly grant: { readonly status: "active" | "revoked" | "tombstoned" } | null;
};

export function spacesClaimStatus(claim: SpacesClaimDisplay) {
  if (claim.state === "issued" && claim.grant?.status === "active") {
    return { title: `${claim.display_identifier} is registered`, detail: "Your name is ready to use." };
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

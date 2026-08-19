# Community creation gate wizard

Status: Storybook exploration, human-only happy path (2026-08-20)

This document describes the standalone SolidJS creation surface. It is not a
port of the legacy React editor and it does not define an api-next policy
contract.

## First release decisions

- Every new community starts human-only.
- No bot membership path and no proof-of-work path are exposed here. Proof of
  work belongs to a separately configured action-grant flow, if and when that
  flow is productized.
- Invitations are deferred. They are not a hidden requirement and are not
  represented as an access-path branch.
- Posting, commenting, and voting settings are outside community creation.
- The creator chooses checks only. The selected checks form one implicit AND
  path; there is no recursive AND/OR editor.
- The creator does not choose Very, Self, ZKPassport, or another verification
  provider. The `human-verification` label is story-owned and provider-neutral
  until the gates-v2 policy addendum defines the claim and assurance mapping.

## Current Storybook catalog

The production catalog exposes the age-18 check. Nationality and gender remain
visible as policy-model holds. NFT, token-balance, and Passport-score checks
are exploration-only and are not presented as api-next-backed production
capabilities.

Nationality uses a searchable ISO country catalog and stores selected country
codes, rather than asking the creator to navigate a short fixed list.

## Future extensions

Additional provider methods, invitation-based communities, alternative access
paths, and engagement rules require separate product decisions. Adding them
must not reintroduce the legacy React editor or a general recursive policy
builder into Solid.

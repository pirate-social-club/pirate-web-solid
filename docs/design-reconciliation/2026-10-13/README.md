# Storybook implementation direction

The workspace_owner has released Storybook implementation from the earlier Paper-only restriction. The cloud agent has no Paper access and should fully reconcile both Storybook catalogs using the exported references. Card and profile are the first tranche, not the whole assignment.

Read [IMPLEMENTATION-DIRECTION.md](IMPLEMENTATION-DIRECTION.md) for the recorded instruction, resolved implementation choices, dependencies and acceptance. Read [STATE-MACHINE-PLAN.md](STATE-MACHINE-PLAN.md) for the parallel behavior review. The task record is [solid-paper-storybook-reconciliation.md](solid-paper-storybook-reconciliation.md), registered in the workstation control plane at `8731b34be71edc902c8c7be21b75c599b2e0f901`. Cloud admission remains to be performed in the actual container.

The immutable design export is at [9c219817](https://github.com/pirate-social-club/pirate-web-solid/tree/9c219817b915859398923d5ad56dd83afdedeb30/docs/design-handoff/2026-10-12). The independent audit is at [f77c6871](https://github.com/pirate-social-club/pirate-web-solid/tree/f77c6871bd2ed6f2a13890997f106a9cffd18417/docs/design-audit/2026-10-12). Fetch those refs and read the files directly; do not require workstation paths or Paper. Preserve both branches as evidence.

This small package supplements the original brief. It supersedes its Paper-only implementation hold and narrow first-slice dispatch scope. It does not ratify unresolved product rules or provide missing API contracts. The full reconciliation must record each of the 95 design sheets as reviewed and implemented, deliberately different with a reason, or blocked on a named dependency. A story title match is not visual acceptance.

Start source work on a fresh `feat/paper-storybook-reconciliation` branch from current published main, initially `45d07cb25b3267ad16f158aa40eff7d11ad49c5e`. Do not stack implementation on the audit branch. Complete actual cloud task/worktree admission before editing. This publication is documents only; no source worktree, app change, build, release or runtime acceptance is claimed.

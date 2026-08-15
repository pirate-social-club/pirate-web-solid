# Pirate Web Solid — Agent Notes

This checkout is a frozen archival migration source. The permanent
implementation lives under `web/solid/`; do not use this repository for new
implementation work or repairs. Preserve its history as migration evidence.

## Repository boundary

This is a standalone Git repository beside `web/`, not a package inside the
Web repository. The two repositories have independent history, dependencies,
and release workflows.

## Change policy

- Do not edit, stage, commit, or push this checkout for ordinary feature work.
- Any archival change requires explicit coordinator authorization, a named
  purpose, and a preservation checkpoint before the change.
- Do not repair the historical `../solid-storybook-poc` dependency or use this
  checkout as an implementation lane.
- New Solid application work belongs in `web/solid/`; design-system work
  belongs in `pirate-solid-design-system/`.

## Verification

Use read-only Git and workspace checks for inspection. Do not install
dependencies, start servers, or run product builds here unless an authorized
archival investigation specifically requires it.

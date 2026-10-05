# Profile composition reference

The workspace_owner confirmed Compositions/Profiles/ProfilePage as the intended
profile preview on 2026-10-05. The historical profile-page.tsx was inspected
read-only as a design reference. Its SHA-256 is
d6eaa815b5e9b23233dbe91d5b0218bb5b1aa712a975f80a9c680767cddbcf8d.

The Solid composition implements Overview, Posts and Comments with the owned
underline Tabs primitives. Wallet and Book require supplied panels. The
existing Solid public-profile header and viewer-owned Settings control remain
the identity presentation. Activity and statistics are explicitly supplied
fixtures in Storybook and are unavailable in production until public reads
exist. This is partial presentation parity: the reference's follow, message,
editing, voting, rich post, wallet and booking integrations are not ported.

No React source, imports, dependencies, legacy API calls or reference-workspace
runtime paths were copied into the product. This file records design provenance
rather than a runtime dependency or a claim of full reference parity.

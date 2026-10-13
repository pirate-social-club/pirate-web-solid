# Telegram login experiment

The temporary `/internal/telegram-login-probe` page tests Telegram OAuth through
the installed headless Privy SDK 0.70.0. It can create a Privy identity. It does
not create or connect a Pirate account, issue an application session, create an
embedded wallet, change a practice lesson or enable rewards.

The server render requires staging canonical origin
`https://web-next-staging.pirate.sc`, a matching request URL and a date before
2026-10-17 00:00 UTC. Production, missing configuration, expired dates and static
handle rendering return 404. Browser actions independently require the actual
staging browser origin and the same end date; community-host navigation cannot
start this ceremony. Privy app and optional client IDs come from the existing
`/internal/verification/config`, with app `cmsw5pis300b80cladbxx7bsr` checked before
initialization. No new Worker handler or runtime configuration is added.

Sign-in redirects in the same tab. Only OAuth state, PKCE verifier, staging app
ID, version and start time survive in one sessionStorage entry, for at most five
minutes. No access, refresh or identity token is persisted there. The callback
consumes that entry before any asynchronous work, checks exact origin, route,
unique SDK callback fields and expected state, then restores just the two pinned
PKCE keys into a new memory-only SDK. Browser history and SSR/router HTML exclude
the callback code and state. Cancellation, failure and completion clear the
continuation and SDK memory. Back navigation to the initial page discards a
pending attempt. A return to a new browser tab without state fails explicitly.
Both Ethereum and Solana embedded-wallet creation are explicitly off.

Success reports only that login returned, with the original start time, return
time and a hash of the browser-observed Privy subject. It is not a verified
identity or authorization result. The page does not require an identity token,
apply a second token verifier or send provider tokens to a new website endpoint.
An operator must independently confirm the attempt before accepting this spike.

After the real phone return, use the managed staging Privy app secret in a
read-only lookup by the existing practice sender's numeric Telegram ID. This is
Privy's documented POST lookup operation, not a user creation call. Keep its full
response and all credentials in memory. Record only whether the unique Telegram
linked identity matches the practice sender, the independently returned Privy
subject hash matches the page's browser observation, and the latest verification
time falls in the attempt window at the provider's timestamp precision. A
missing, stale or mismatched result is a failed proof. Do not infer freshness
from the request time or fabricate an updated verification time.

The phone test must open this link from Telegram, approve the Pirate-controlled
OAuth login, return to the same Telegram browser tab and show the result. Test
cancellation separately. Provider configuration, local fixtures and a successful
page render do not establish actual phone acceptance. Record no raw numeric IDs,
provider subjects, callback values, tokens, usernames or profiles in chat or
saved evidence.

Account recovery, existing-account association and the post-lesson connection
button are separate implementation. Their real authorization belongs in
api-next, using its existing reviewed Privy token validation and authenticated
user lookup under the reviewed account transition. This diagnostic page and
operator lookup do not select or replace the platform's account-linking contract.
Publication and deployment follow the normal reviewed main and guarded staging
workflow after actual shared-resource handback. The HNS adapter and its ingress
fingerprint stay identical to the base source.

Provider lookup documentation:
https://docs.privy.io/api-reference/users/get-by-telegram-user-id

# Accounts, profiles and external setup

2026-11-04. **Design only for Google sign-in, usernames, account linking/deletion and uploaded avatars in the current slice. No Google sign-in or upload endpoint is claimed implemented or production-ready.** Existing signed guest sessions, profile/history/achievements remain active; Sin Coins/cosmetic additions are tracked separately.

## Existing architecture

The app signs an httpOnly `pw_session` cookie with jose and exchanges it for short-lived realtime tokens. Player kind includes GUEST and reserved REGISTERED. There is no existing OAuth/auth framework/provider or R2/S3 integration to reuse. Extend this identity model; do not introduce a second user/session database. Cookie identity must remain stable when upgrading an unlinked guest.

## Google identity implementation design

Server authorization-code flow with PKCE S256, random state and nonce, short-lived signed same-site httpOnly transaction cookie, and one-time database consumption. Exchange the code over bounded HTTPS; validate the ID token signature against Google's keys plus issuer, audience, expiry, nonce and immutable subject. Do not use email as the account key or retain access/refresh tokens when no Google API access is required. Minimal scopes: openid and profile; request email only if an explicit contact feature needs it. Never auto-publish Google's name/photo/email.

Account has unique `(provider, subject)` and references Player. First unlinked Google sign-in can claim the currently authenticated GUEST player in the same serialized transaction, preserving all stats/ledger/inventory. Returning provider signs in to its existing player. If another guest currently has progress, show a choice to switch account and leave that guest intact; do not silently merge two balances/history. A registered identity cannot link a provider already owned by someone else. Concurrency tests must cover first-link races, CSRF, consumed state, mismatched nonce/audience, revoked/invalid signatures and duplicate subjects. Sign-out clears the account session, and signed-out play creates a new guest rather than exposing the prior account.

## Google dashboard steps (future provider route contract)

These URLs are the planned callback contract, not live implemented routes:

- Local origin: `http://localhost:3200`; redirect: `http://localhost:3200/api/auth/google/callback`.
- Production canonical origin: `https://sinversegames.com`; redirect: `https://sinversegames.com/api/auth/google/callback`.
- If www will remain an independent sign-in origin, separately register `https://www.sinversegames.com` and `https://www.sinversegames.com/api/auth/google/callback`, or choose a canonical redirect before starting OAuth. State/cookies must bind to the actual origin; never trust arbitrary forwarded host values.

In Google Cloud Console choose/create the project, configure Google Auth Platform Branding/Audience (app name SinverseGames, monitored support address, authorized domain, privacy/terms URLs), and use testing/test users until the flow is validated. Create an OAuth client of type Web application, register the exact redirect URIs above, and register JavaScript origins if using Google Identity Services in the eventual client. A server redirect flow itself uses the registered callback. Configure server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and an explicit `GOOGLE_REDIRECT_URI` via local ignored environment/host secrets, never chat or committed files. Separate local/preview/production clients and test users. Do not publish a preview using production secrets/database.

The issuer/token/state rules and exact redirect matching are documented by [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) and [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server). Credentials and a real consent round-trip are required before any production-ready claim.

## Profile and avatar design

Add normalized unique username with a case-insensitive database uniqueness constraint, separate from mutable display name. Retain deterministic fallback avatars, selected cosmetic frame/nameplate, game stats/history/achievements/favorites, and private wallet/history. Shared public profile data excludes provider IDs, contact email, ban details and private ledger references.

No image storage is configured. Future uploads accept only JPEG/PNG/WebP, at most 2 MiB and 4096×4096 pixels, reject animation and decompression/metadata bombs, decode the actual bytes server-side and output a fresh 256×256 WebP with stripped metadata. Do not trust extension/MIME/header dimensions alone, and never let a browser resize substitute for server validation. Use random ownership-scoped object keys and atomically replace/remove the current reference; user input cannot select another player's key. Serve through a controlled URL/content type with nosniff. Keep binaries out of Postgres.

Recommended Worker deployment: R2 binding `AVATARS` plus a vetted server image decoder/transformer. Cloudflare Images binding is an option but its tutorial requires an Images Paid subscription, so it is **not approved or provisioned** by this brief. Before implementation choose either an explicitly approved Images service or a measured portable decoder within Workers limits; do not add a Node-only sharp endpoint that fails on Workers. See [Cloudflare image processing tutorial](https://developers.cloudflare.com/images/tutorials/optimize-user-uploaded-image/) and [R2 server-side uploads](https://developers.cloudflare.com/r2/objects/upload-objects/).

User dashboard actions after the tested implementation exists: create isolated local/preview buckets, bind `AVATARS` to the selected Worker/configuration, configure lifecycle for unreferenced replaced images, approve the chosen processing service if paid, and verify public/private serving and retention. No storage credentials belong in browser code. Exact binding/schema/deploy steps must be finalized with the implemented processor; this design does not imply uploads are usable now.

## Retention and deletion

Retain game outcomes, profile settings, achievement keys, inventory and ledger while an account exists. Do not store drawings, guess text, private hands or OAuth bearer tokens in match history. A deletion request must authenticate the owner, prevent new earnings/purchases while pending, revoke sessions/provider links, remove avatar objects, and delete or anonymize participation names/public rankings consistently. Define a documented completion window and backup retention policy before exposing the feature. Until then, the existing contact/support deletion request remains the available channel; do not present a nonfunctional self-service deletion button.

## Migration and readiness

Provider/profile/deletion/upload schema will be additive and separately tested with existing guest balances/history. A guest cookie currently does **not** restore identity across devices or after cookie loss. Wallet/inventory durability in Postgres does not solve account recovery. Report this limitation in the store/profile until actual persistent sign-in ships.

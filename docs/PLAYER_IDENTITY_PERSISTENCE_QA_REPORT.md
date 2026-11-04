# Player Identity & Persistence implementation and QA

Local milestone, started 2026-11-04; final QA continues 2026-11-05. Repository `D:\dev\games`, branch `codex/takeover-and-reliability-audit`, initial clean HEAD `f4819345b92392c9dd274394c0b7d9edc3833046`. Cuisine Quest checkpoint `14ac4ef` and all prior work are preserved. No push, PR, merge, hosting deployment, production migration/data/configuration change, external bucket or paid service provisioning.

## Executive status

The milestone is implemented: optional guest/Google entry, safe in-place linking, returning-provider resolution, registered session revocation, unique usernames, optional avatar upload/replace/remove, onboarding, public profile/ranking presentation and account settings. Targeted browser checks verify recovery in **two independent browser contexts**, with a controlled OIDC provider, signed ID tokens, actual PKCE/nonce validation, real PostgreSQL and actual image decoding/local file persistence. These are not real Google consent or R2 tests. Original game rules/engine/client/test files and prior artifacts remain unchanged.

Full local acceptance passes, including the final wallet-only presentation rebuild and focused repeat. The distinction below must remain visible:

| Category | Status |
| --- | --- |
| Implemented and locally verified | Stable Player ID linking, same wallet/progress, username/collision rules, 30-day sessions/revocation, normalized image lifecycle, independent-browser recovery using controlled provider |
| Implemented, awaiting external configuration | Real Google Web OAuth client/consent, private R2 AVATARS binding and real bucket permissions |
| Not implemented | Automatic player merge/coin transfer, provider unlink, self-service deletion, email/password auth, content moderation beyond initial username denylist, durable background cleanup scheduler |
| Requires future production verification | Real Google consent/cookies, actual R2 writes/reads/deletes, deployed web-to-Node image jobs, runtime container, apex/www canonical-origin behavior, physical-device/browser accessibility review |

## Initial architecture findings

Both root manuals were read and compared. The initial checkout was clean on the requested branch with the later documentation checkpoint above. The actual schema had a permanent Player ID, signed 180-day guest `pw_session`, reserved REGISTERED kind, shared jose identity helpers, Player-linked results/stats/XP/achievements, append-only RewardLedgerEntry, cosmetics and CuisineProgress. No OAuth framework, provider identity, registered session, upload endpoint or R2 integration existed. Existing account documentation was explicitly design-only. No credential values or ignored `.env` contents were inspected.

The existing auth cookie exchanged for a 15-minute realtime JWT. Profiles/wallet and solo APIs resolved the same player. Shared `upsertPlayer` could overwrite profile names from stale token snapshots. The Node realtime service was previously bundled without runtime dependencies; that assumption cannot hold for native Sharp/libvips. The Worker has an existing OpenNext binding-access mechanism and Node code must remain outside it.

## Final architecture

[Authentication and security contract](AUTHENTICATION.md) contains the linking/recovery diagram and precise API behavior. [External setup/local commands](PLAYER_IDENTITY_SETUP.md) gives owner actions. The same Player row owns all progress. ExternalIdentity binds a Google immutable subject to that Player; there is no second user, wallet or progress store. Guest linking upgrades kind in place; explicit returning sign-in resolves the existing provider owner. A provider collision never overwrites either player or transfers records.

The existing jose/Web Crypto stack handles authorization code, state, S256 PKCE, nonce and RS256 ID-token verification. No competing auth framework was introduced. Google endpoints are fixed; AUTH_ORIGIN selects the exact allowed browser/callback origin and destinations are fixed. Browser authorization starts with a same-origin POST and navigates to the server-generated URL, keeping the existing strict `form-action 'self'` CSP intact.

Registered `pw_session` values are opaque random secrets, hashed in AccountSession. Lifetime is 30 days, with at most 20 active sessions; account UI lists dates/current-browser status without identifiers. Session data is read server-side. Guest cookies continue working until linking, after which their old JWTs are rejected through the stored kind. Realtime tokens include a session hash and the service validates it at handshake and before packets. Shared upsert/result snapshots no longer overwrite stored display names/colours; intentional profile edits remain separate.

Identity API failures cannot establish a browser-selected player. A session database lookup failure returns retryable errors and must not overwrite the old cookie with a new guest. Client account UI offers a retry and preserves its known state. Database dependency failures remain fail closed; this is not an offline registered-session system.

## Database and migration

Additive migration: `packages/db/prisma/migrations/20261104030000_player_identity/migration.sql`.

- Nullable Player fields: username, usernameChangedAt, avatarKey and onboardingAt.
- Canonical username unique index and SQL lowercase/format/length CHECK. All names explicitly normalize to lowercase before storage, so uniqueness is case-insensitive without depending on locale collation.
- ExternalIdentity composite provider/subject key and unique player/provider index, with Player FK.
- AccountSession hashed secret, Player FK, creation/expiry and player/expiry index.
- OAuthAttempt hashed state/browser binding, actor/session binding, one-use consumption, verifier/nonce and expiry index. No provider token or code is stored.
- IdentityRateLimit hashes sensitive-route identities and atomically updates distributed fixed-window counts.

Both Prisma clients regenerate. Fresh isolated `sinversegames_identity_test` applies all committed migrations. A separate `sinversegames_identity_upgrade_test` is built from all pre-identity migrations, populated with an existing guest, ledger, owned/equipped cosmetic, achievement, stats/XP and cuisine stars/best. After the new migration, all **12 legacy tables** have identical counts/row hashes, excluding only the four newly added nullable Player columns. The existing developer database was also explicitly selected at loopback port 5433, migrated additively and verified with the same 12-table count/hash preservation check; [developer integrity](../artifacts/identity/developer-migration-integrity.json). No production migration ran. The upgrade representation is intentionally isolated rather than a production data copy.

Linking/username/session/reference operations use the existing Player lock and transactions. Provider uniqueness resolves races; a failed claim cannot leave a new wallet or partial progress. The ledger remains append-only and its SUM remains the balance authority.

## Authentication and linking behavior

The ten-minute OAuthAttempt binds state, browser cookie and initiating session fingerprint. Callback consumption is atomic before token exchange. Missing/mismatched/expired/used state, changed actor session, cancelled consent, invalid code, wrong nonce/audience/issuer/signature, expired ID token and unverified email fail without linking. Google's documented issuer forms are accepted only for the fixed Google configuration; the fixture uses its own exact issuer/JWKS. Subject—not email—selects the account. Google name/photo/email/access/refresh tokens are neither retained nor auto-published.

An unlinked guest choosing Connect Google preserves its exact ID/data. A new provider choosing explicit sign-in creates one new registered player; a returning subject resolves the existing one. Another guest attempting to link that subject gets a clear collision message and an explicit sign-in alternative. It can choose to switch to the existing player while leaving its guest intact. There is no hidden merge, balance migration or browser-provided ownership selection. Fixed diagnostic categories are logged without sensitive provider payloads.

Session cookies are httpOnly, SameSite=Lax, host-only and Secure on a configured HTTPS public site. Sign out revokes the current registered session and clears the cookie; sign out other browsers revokes the rest. Existing guest JWT signout clears the local cookie but does not revoke every stolen copy; linking/expiry is the compatibility boundary. A revoked idle socket is disconnected on its next incoming packet, not proactively pushed out immediately. A linking transaction that succeeds before a later session-cookie/network failure is recoverable by signing in with the newly linked Google subject; do not clear data or retry with a new player.

## Username and account experience

Usernames use 3-20 ASCII letters/numbers with a single underscore only between words. Whitespace is rejected, lowercase canonicalization is explained, and reserved admin/system/platform plus an initial inappropriate-name list are blocked. The denylist is bounded and does not claim complete moderation. Display names remain separate and nonunique; a display name is not a verified staff badge.

Authenticated server availability checks disclose only public name availability. DB uniqueness handles case/concurrent claims; unchanged names are idempotent and renames require 30 days. Guest ownership claims are rejected. Onboarding offers username, optional picture/default, profile preview and completion back to profile. Account settings provide linking status, session dates, revoke-others, signout confirmation and recoverable loading/errors. Guest play has a gentle save-progress prompt and remains unforced. Profile keeps actual level/XP/wallet/achievements/cosmetics, game records, activity and the cuisine passport; it adds saved username/image and Google-linked status.

## Avatar processing and storage

Actual uploads use an authenticated same-origin binary proxy, maximum actual bytes 5 MB, allowlisted MIME plus signature/decoder checks. SVG, executables, spoofed MIME, truncation, excess dimensions and animation are rejected. JPEG/PNG/WebP decode on the existing Node realtime service with Sharp/libvips, constrained pixels/dimensions and processing timeout/concurrency. APNG/WebP animation flags and decoder page counts prevent accepting just a first frame. Orientation is applied, square crop uses the image centre, metadata is stripped, and fresh 64/256px sRGB WebPs are produced. Filename extensions are ignored; arbitrary filenames/paths never reach storage.

Web-to-Node jobs are signed for a distinct purpose/audience, expire in 30 seconds, and reject reused IDs. Only two concurrent normalizations run per service instance. The Worker never loads Sharp. Normalized variants are written through private R2 binding AVATARS; random keys are server-chosen. Locked reference changes, after-commit old-object deletion and failure cleanup prevent ownership/path attacks. Public image routes require an active reference and use fixed WebP/nosniff/sandbox/same-origin headers. Broken images fall back to initials; uploaded pictures remain compatible with equipped cosmetic frames.

**Storage evidence boundary:** local tests write actual files and exercise actual Node decoding, replacement, removal and served-byte verification. This guarded local filesystem adapter is not an R2 mock claiming deployment success, and it is disabled outside explicit loopback *_test fixture configuration. No real R2 put/get/delete was run. Cleanup failure can leave unreachable orphans; owner scheduling/lifecycle review is still required. Public avatar bytes cached before deletion can survive their five-minute TTL.

Sharp is the only new runtime dependency (0.35.5, already present transitively under Next). It must remain external to the realtime bundle and its native production dependencies must be copied into the runtime image. Linux local packaging now verifies the actual server health, signed normalization job, 64/256 output and job replay rejection. That is not a Docker/Railway deployment or production container certification.

## Persistence and independent-browser verification

The browser fixture creates a guest and server-verifies/persists a complete Indian Cuisine Quest service, then performs a real cosmetic purchase/equip. This is explicit test setup through the existing verifier/repository, not a fabricated browser score or a claim that the account test manually plays the campaign. Before/after linking, the test compares original XP, stats, achievements, reward rows, CuisineProgress, inventory and equipment under exactly the same player ID. The first fixture service earns 52 coins and Brass orbit costs 15; the recovered balance is exactly 37, without a second wallet.

Browser A links, claims username, previews/uploads a PNG, completes onboarding and refreshes. Browser B has a separate context/cookies, signs in through the controlled provider and receives the same Player ID, avatar key, saved username, passport and leaderboard record. Served full avatar bytes decode to 256px WebP. JPEG and WebP replacements exercise the same route; old URLs return 404 after reference replacement, removal restores default, and the profile/leaderboard keep the same ID. A retained old guest cookie is denied after linking. Revoking Browser B denies its session and disconnects its already established socket on the next packet. A signs out and signs back in to the same data. No account credentials are invented or supplied to real Google.

## Security verification and limits

Every account mutation derives ownership from getSession, checks origin and uses a small strict schema or bounded binary body. Client playerId/price/balance/provider claims cannot select ownership. Sensitive-route limits use shared PostgreSQL counters; CF-Connecting-IP takes precedence on Cloudflare, and deployment must trust only its own proxy headers. Rate limits/guest IDs do not prove human input or prevent all multi-identity abuse. Username availability necessarily reveals availability of a public handle; it does not expose provider/email membership.

No OAuth code, raw token, provider subject/email, session secret or full sensitive payload belongs in logs/review artifacts. Operational edge request logging may still capture callback query strings unless the hosting owner configures redaction/retention; review that before enabling real credentials. Registered access fails closed on DB errors. Expired attempt/session/counter cleanup is bounded in request paths where stated and otherwise needs an owner maintenance schedule. There is no paid security/storage service, automatic account merge or self-service deletion hidden behind an inert button.

## Validation ledger

| Check | Current result |
| --- | --- |
| Unit/integration | Final full run 200 passed: 149 engines, 11 shared, 40 realtime/processing/configuration; all prior 189 retained |
| Final image-specific tests | 5 passed, including a genuine two-frame animated WebP rejection |
| Real PostgreSQL | 45 passed: original 21 plus 24 identity/session/username/limit cases |
| Five package typechecks | Final complete run passed, including configuration tests and wallet presentation correction |
| Node production build | Final Node web/realtime build passes, including final wallet presentation correction; all account/Google/avatar routes included |
| Focused identity browser | Two cases passed in 22.3s: real local linking/onboarding/avatar lifecycle/cross-context recovery/revocation and hostile-provider/upload checks |
| Expanded browser suite | Final 35 passed in 16.4m, no skips/retries: all original 31 plus four identity/outage cases; final wallet-only build also passes all 6 focused economy/identity/outage cases in 1.1m; earlier complete 34-case run passed |
| Linux OpenNext | Final Worker build passes including wallet presentation correction; frozen install plus explicit Prisma generation |
| Linux packaged Node/Sharp service | Actual health, signed PNG normalization to 64/256 WebP and replayed-job 401 pass after bundler correction |
| Migrations | Fresh full migration, populated pre-identity upgrade and explicitly verified local developer migration pass; 12 legacy table hashes preserved in both populated targets; Prisma reports no schema difference |
| Manuals / original preservation / final staged review | Both manuals synchronized; 219 original engine/client/test/artifact paths unchanged; final inventory, whitespace and documentation checks recorded below |

The complete original Cuisine Quest real campaign remains in the full browser suite; the local identity fixture is separate from that gameplay acceptance. No original assertion was deleted, skipped or weakened. The final expanded browser run includes every existing game and the full seven-cuisine campaign, with no modified original assertions. A final wallet-only presentation correction replaces obsolete "recovery unavailable" copy with an account-settings link and passes the existing avatar key into its portrait; it changes no economy or game rules. Final builds/focused checks include that correction. The three configuration unit tests are isolated and perform no provider/network calls. The complete 200-case run includes them. Reviewed captures include [desktop account](../artifacts/identity/account-desktop.png), [320px account](../artifacts/identity/account-320.png), [onboarding preview](../artifacts/identity/onboarding-preview-desktop.png), [desktop profile](../artifacts/identity/profile-desktop.png) and [320px profile](../artifacts/identity/profile-320.png). A supplemental real-UI fixture flow checks seven widths (320/360/375/390/430/768/1280), reduced motion and zero page errors; [measurements](../artifacts/identity/visual-review.json). This fresh visual fixture seeds no wallet/game results; its OIDC provider is controlled and storage is local.

## Retained failures and corrections

1. Initial real DB run: 44 passed / one failed. A missing link actor surfaced the existing NO_PLAYER wallet-lock error rather than the account session-changed code. Mapped that missing-actor condition without weakening the test; the 24 identity cases and full 45-case run then passed.
2. First Node build after adding inventory persistence comparisons failed because the post-link fixture query omitted inventory/equipment includes. Fixed the fixture query; kept the comparisons.
3. Initial two browser cases failed to leave account settings: the existing strict CSP blocked a native form POST redirect to the external provider. Switched to same-origin POST returning the server-generated URL, followed by browser navigation; no CSP relaxation. A syntax typo in the first button edit caused one intermediate build failure and was corrected.
4. Next browser run passed recovery but rejected a broad role=alert locator because Next's route announcer is also an alert. Scoped the new assertion to the account panel. No product error or original assertion was hidden. Two focused cases then passed, followed by additional hostile issuer/signature/state and session tests.
5. Linux OpenNext passed, but first runtime package layout hit pnpm 11's ignored workspace postinstall restriction. Clients were already explicitly generated; packaging now uses --ignore-scripts. The local package command copies files only and does not deploy a hosted service.
6. An actual packaged-server startup then exposed the broad tsup noExternal pattern bundling Sharp despite its external listing. Excluded Sharp from that pattern; the smaller bundle imports its installed native module. Linux packaged service now starts and normalizes real bytes. Supporting harness attempts also encountered Windows/WSL shell quoting and incorrect module paths; these are retained local diagnostics, not app passes. Frozen workspace dependencies were restored before rebuilding after pnpm package-layout checks.
7. Final review identified a DB outage could otherwise look like a missing session and invite a cookie-replacing guest creation. Added explicit session-unavailable handling and a browser fault-injection check requiring 503/no replacement cookie/recovery. The final 35-case browser run passes this fault injection: session read/create return 503, no replacement cookie, retry UI, and recovery of the same player after the table is restored.

8. Automatic review blocked a supplemental attempt to start an unconfigured local web server on port 3215; the tool stated only "blocked by policy". That server check was not run and is not counted as a pass. Three isolated configuration tests instead verify missing credentials/unsafe origins disable Google and fixture mode cannot select a remote provider origin or nonlocal/non-test DB. No attempt was made to bypass the server-launch rejection. This is explicitly an unrun supplemental browser/server check, not a failed product assertion.

Ignored raw diagnostics live in `.data/identity/`. Identity network tracing is disabled because it could retain codes/cookies. Initial failed fixture traces were temporary ignored output and were replaced by subsequent runs; none are committed. Only sanitized review evidence is retained in `artifacts/identity/`.

## External owner checklist

1. Configure a Google Web application client and consent/test users with exact callback `http://localhost:3200/api/auth/google/callback` for development and `https://sinversegames.com/api/auth/google/callback` for the production client. Use separate environment clients and exact domains; no wildcard preview credentials.
2. Supply web-only GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / AUTH_ORIGIN through the ignored environment or host secret manager. Keep AUTH_SECRET identical on web/realtime. Never paste secrets into chat. This server-redirect flow does not use Google JavaScript origins/GIS.
3. When approved, create/bind a private R2 bucket as AVATARS. Keep r2.dev public access disabled; browser-to-bucket CORS and frontend R2 credentials are unnecessary. Confirm real put/get/delete permissions after deployment.
4. Apply additive migration `20261104030000_player_identity` through the approved release process before app code, and use the updated native-dependency Node image. Verify REALTIME_INTERNAL_URL reaches it over HTTPS, with matching signing secret.
5. Disable IDENTITY_TEST_MODE / AVATAR_LOCAL_DIR externally. Review canonical apex/www host-only cookie behavior, request-log query redaction, orphan/counter/session cleanup, legal/privacy wording and actual provider/storage recovery. This milestone does not authorize deployment or external provisioning.

See [PLAYER_IDENTITY_SETUP.md](PLAYER_IDENTITY_SETUP.md) for exact local commands, bucket template, retention notes and environment setup. Self-service deletion remains the existing contact/support route; no incomplete deletion UI is offered.

## Files, Git and remaining limits

Exact changed-file inventory: [changed-files.txt](../artifacts/identity/changed-files.txt). Local implementation checkpoint is recorded in the final acceptance note; no push/PR/merge/deployment. Preservation verifies **219 original engine/client/test/artifact paths unchanged** from f481934. Both manuals are updated together and compared byte-for-byte. The final preservation inventory includes the entire engine package and all original test helpers. Documentation review checks 61 local links across 13 changed Markdown files with zero broken files/anchors. The complete staged diff was reviewed: 79 intended files, exact match to the inventory, no whitespace errors or credential material, and no generated/ignored files. Exact local commit status is recorded with acceptance. All owned QA web/realtime/provider/database processes are stopped. No Toolyaro files/services or unrelated ports were modified.

Remaining external limits: no real Google consent round-trip, no actual R2 storage verification, no production session/storage/load claim, no physical phone or screen-reader certification, no comprehensive image moderation, no self-service deletion/unlink or automatic account merge. Hash/session/counter retention and avatar orphan cleanup require operational scheduling. All of these are distinct from the locally implemented and tested account flow.

## Local acceptance checkpoint

Implementation committed locally as `fed214f2599d74228cd8de37168673fbac1a3f48` (`feat: add player identity and persistent accounts`) on `codex/takeover-and-reliability-audit`, preserving baseline `f4819345b92392c9dd274394c0b7d9edc3833046`. The working tree was clean immediately after that 79-file commit. This documentation-only confirmation is committed separately; the final task response supplies its resulting HEAD and final working-tree status. Both instruction manuals remain byte-identical. All 219 protected original paths remain unchanged; all owned QA listeners are stopped. Nothing was pushed, merged or deployed.

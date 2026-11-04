# Player identity local QA artifacts

2026-11-04/05. These are local test identities and controlled provider screenshots, not Google production consent or R2 evidence. No tokens, authorization codes, provider subjects, cookies, ledger histories or raw network traces are included.

- account-desktop.png / account-320.png: actual account UI after local provider linking, saved username and normalized uploaded picture.
- onboarding-picture-desktop.png / onboarding-preview-desktop.png: actual onboarding and profile preview.
- guest-account-desktop.png: optional guest link/sign-in experience.
- profile-desktop.png / profile-320.png: existing profile integration with saved username/picture; the visual fixture has no invented game statistics or wallet credits.
- account-320-initial-pass.png: capture from the first passing full browser run, before final outage hardening; final run capture is added separately.
- account-320-browser-acceptance.png: capture from the complete 35-case acceptance run.
- visual-review.json: seven responsive widths, reduced-motion context and page errors for the explicit local provider/real image-storage visual flow.
- migration-integrity.json: equal row counts/hashes across all 12 pre-identity tables in a populated isolated upgrade representation. Only the four newly nullable Player columns are excluded from its comparison.
- developer-migration-integrity.json: preserved rows in all 12 existing local developer tables around the explicitly selected loopback migration.
- preservation.json: original engines, clients, tests and prior committed artifacts unchanged from f481934.
- linux-runtime-validation.json: actual packaged Linux Node service health, 64/256 image normalization and replayed-job rejection; no hosting/container deployment.
- document-links.json: local documentation link review; final counts are also in the QA report.
- [acceptance-summary.json](acceptance-summary.json): exact local acceptance totals and explicit external-verification boundaries.
- [changed-files.txt](changed-files.txt): complete implementation commit inventory, including these artifacts.

The test provider uses signed JWTs and real PKCE/nonce validation. Local filesystem writes are actual test files, not R2 access; external provider/bucket configuration remains pending. See [QA](../../docs/PLAYER_IDENTITY_PERSISTENCE_QA_REPORT.md), [authentication](../../docs/AUTHENTICATION.md), and [owner setup](../../docs/PLAYER_IDENTITY_SETUP.md) for exact outcomes, rejected/intermediate attempts and limitations. No production action is authorized by these artifacts.

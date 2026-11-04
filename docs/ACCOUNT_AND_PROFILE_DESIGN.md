# Accounts, profiles and external setup

The former design-only document is superseded by the Player Identity & Persistence implementation. The same Player ID now supports optional Google linking/sign-in, server-revocable registered sessions, canonical unique usernames, onboarding and normalized avatar uploads. Real Google consent and deployed R2 storage still require owner configuration and verification.

- [Architecture, linking/recovery, sessions, usernames and security](AUTHENTICATION.md)
- [Exact external setup and local commands](PLAYER_IDENTITY_SETUP.md)
- [Implementation status, test evidence and remaining limitations](PLAYER_IDENTITY_PERSISTENCE_QA_REPORT.md)

Guest play remains optional and compatible. Linking preserves ledger, inventory, equipment, achievements, stats, history and Cuisine Quest progress in place. There is no automatic merge or transfer between two players. Clearing an unlinked guest cookie can lose access; linked players can return with their Google subject on another browser after provider configuration.

Avatar decoding runs on the existing Node realtime service using Sharp/libvips, not in the Cloudflare Worker. The Worker proxies authorized uploads and writes normalized variants through a private R2 binding. Local tests use explicitly guarded filesystem storage and are not proof of R2 access. No paid image service is introduced.

Self-service deletion/provider unlink remains unimplemented; use the existing contact/support channel. A future deletion workflow must define retention/anonymization and backup handling without silently deleting ledger or historical records. No external provider, bucket, dashboard or production configuration was changed in this milestone.

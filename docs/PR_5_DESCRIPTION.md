## Unified SinverseGames platform

This branch merges the SinverseGames work into one repository and one deployable app (`apps/web` with `apps/realtime`, `packages/engines`, `packages/db` and `packages/shared`). Every game is integrated.

**Platform**
- The unified platform and game registry, with the Cloudflare default-build fix and production deploy gates.
- A calmer design system across the site, with before and after screenshots.

**Sinverse Cricket**
- **Players:** realistic fictional athletes built from CC0 MakeHuman assets, retargeted onto the procedural rig.
- **Motion:** CC0 Quaternius motion clips for running and throwing, with foot locking, longer strides and turn lead.
- **Bowling:** bowling and spin presentation, per-preset performance benchmarks, and a replay strip that stays off the action.
- **Batting:** 15 procedural batting strokes plus the leave, with exact engine contact (0.000 m) and hands on the handle.
- **Phase 5:**
  - fielding and wicketkeeping that anticipate the ball (hands within a few centimetres of the engine's take)
  - the keeper's collection and stumping
  - varied, in-character celebrations
  - a broadcast camera set with cuts
  - between-ball graphics drawn from the scorebook

- **Team catalogue (data only):** 20 international teams with fictional squads, attributes, kits and selection rules. The engine doesn't use them yet; the plan is in `docs/CRICKET_FORMATS_EXPANSION_PLAN.md`.

**Tests on the final code:** production build, typecheck, 539 unit tests, 65 database tests, the browser suite (166 passed, 0 failed, 9 on-demand recorders skipped), and the Cloudflare/OpenNext build with a dry-run packaging check.

**Engine:** unchanged. No changes to scoring, catches, ball ownership, run-outs or replay events. Engine-side fielding work is proposed, not implemented (`docs/CRICKET_ENGINE_V2_PROPOSAL.md`).

**Reports:** `docs/SINVERSE_CRICKET_PHASE3_REPORT.md`, `docs/SINVERSE_CRICKET_BATTING_REPORT.md` and `docs/SINVERSE_CRICKET_PHASE5_REPORT.md`, which includes the test results and the evidence paths.

Not merged and not deployed. It needs the owner's review.

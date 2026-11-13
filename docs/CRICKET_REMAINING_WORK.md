# Sinverse Cricket: remaining work

What is not done after the release-readiness milestone, and why.
- Done: `CRICKET_IMPLEMENTATION_PROGRESS.md` and `CRICKET_RELEASE_READINESS_REPORT.md`.
- Rules checked: `CRICKET_RULES_VALIDATION.md`.

## Needs your decision or approval

| Item | Why it's blocked | What it needs |
|---|---|---|
| **Release of T20 and ODI** | Nothing here is pushed or deployed | Your review of the local commits, then an authorized push and deployment. **No migration is needed.** The release changes how version-2 matches play (rules fixes, AI). No version-2 match has been released, so no stored records are affected |
| **Cloudflare Worker CPU for ODI verification** | Local Node takes up to about 0.3 s of CPU to verify a whole ODI when run directly, or about 0.55 s under vitest (after a 45–50% reduction). The Workers plan's limit isn't visible from the repository (`wrangler.jsonc` sets no `limits.cpu_ms`) | Confirm the plan. Workers Paid allows 30 s of CPU per request by default; the Free plan allows 10 ms, which a T20 or ODI verification would exceed locally (about 60–330 ms). If it's tight, verify long matches on the Railway realtime service (see the options in `CRICKET_PERFORMANCE_BENCHMARKS.md`) |
| **Playable Test cricket** | A five-day match exceeds the 6-hour token, the 512 KB body and one sitting | `TEST_CRICKET_PERSISTENCE_PROPOSAL.md`: one additive migration, segment verification and resume. About 7–10 days. Approval of the migration and four policy questions |

## Not yet built

| Item | Notes |
|---|---|
| Super Over (T20) and ODI tie-breaks | A tie is "Match tied": neither a win nor a loss. 6 ties in 500 stress T20s |
| Choosing the opposition's XI | The opposition plays its catalogue XI. The setup now shows both elevens' strength |
| T10, The Hundred, custom formats | `FORMATS` makes T10 a small addition |
| Rain and DLS, over-rate rules, the new ball, reviews (DRS), retirements, hit wicket, obstruction | Not modelled (`CRICKET_RULES_VALIDATION.md`, ⚠️ rows) |
| Field changes restricted on a free hit; Powerplay 1 catching minimums | Fields are whole presets chosen per ball |
| Tournaments, series, career, per-format statistics | Per-format stat lines would need a migration |
| Highlights of simulated passages | Simulated deliveries are summarised and scored, not replayed in 3D |
| Cross-device resume of a T20 or ODI | Recovery is per browser tab. The Test proposal's saved matches would generalise to limited overs if wanted |
| Player names on 3D shirts | Kits wear colours and numbers; names appear in the HUD, cards and scorecards |

## Known limitations

- **Balance comes from tuning, not real data.** At county against county, T20 innings average about 134 runs and ODI innings about 275–281 (simulated, `bench:balance`). Real men's T20 internationals usually score more. The physics model makes boundaries rarer than in real cricket.
- **Elite is hard.** In simulation, the player's side (played by the neutral AI) wins about 25% of T20s and 10% of ODIs against elite (40 matches each). A person playing their own balls can do better, but elite ODIs are meant as a stern test.
- **Run-outs** are about 0.8–1.4 per T20 and 1.6–2.6 per ODI in simulation. That is more than real matches, because the AI takes risky singles, fewer at higher levels.
- **The top performer** is chosen by a published rule of thumb (runs + 20 a wicket + 8 a catch, stumping or run-out). It isn't a judged award.
- **Untested environments:**
  - physical phones and tablets, Safari, and assistive technology beyond keyboard and labels;
  - real Worker CPU;
  - a whole match played ball by ball by a person (the browser tests play some balls by hand and simulate the rest).
- **Abandoned solo matches** aren't recorded, so abandoning a losing match avoids the loss. This is the platform-wide solo model, not cricket-specific.

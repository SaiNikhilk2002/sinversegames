# Infrastructure migration roadmap

Two tracks:
- **Phase 0:** cheap, low-risk changes that lower cost on the current architecture. **Recommended** (`INFRASTRUCTURE_COST_DECISION.md`).
- **Phases 1–8:** a staged Durable Objects migration. **Not recommended now on cost grounds** (`CLOUDFLARE_DURABLE_OBJECTS_ASSESSMENT.md`). It's planned here so it can be picked up safely if the decision changes, and its first phases are cheap ways to get real numbers.

**Ground rules for every phase:**
- **Game engines and rules are not changed.**
- Player identity, Sin Coins, achievements and match history stay in Neon PostgreSQL, untouched.
- Nothing external is created, deployed or reconfigured without your approval.
- Railway is retired **last**, only after the replacement has run in production.

Efforts are for one engineer familiar with the codebase. Elapsed time includes soak periods.

## Phase 0: on the current architecture (recommended)

| # | Change | Saves or fixes | Effort | Needs approval | Rollback |
|---|---|---|---|---|---|
| 0.1 | **Turn on Socket.IO `perMessageDeflate`** in `apps/realtime/src/server.ts`:<br>- `threshold: 1024`;<br>- `serverNoContextTakeover: true` and `clientNoContextTakeover: true`, to bound the memory per socket.<br>Then measure Railway egress before and after. Browsers negotiate it automatically | **About 3× less realtime egress** (measured 3.16× on Bumper Blitz messages). Keeps Railway at the $5 floor longer; at 100 concurrent players, about $63 → $22 a month | 0.5–1 day, including tests and a deflate CPU check | Code change, then a realtime deploy (restarts rooms) | Revert the option and redeploy |
| 0.2 | **Uptime monitors on `rt.sinversegames.com/health`,** not `/api/health` (which queries the database), or no more often than every 30 min | Protects Neon Free's 100 CU-hours from a monitor that keeps compute awake 24/7 | Minutes | Your monitoring tool | Change it back |
| 0.3 | **One database client per request** in the Worker: a request-scoped `getDb()` | Up to 4 → 1 connection per page; lower latency and Neon connection load. Free | 1–2 days, with tests | Code change, then a web deploy | Revert |
| 0.4 | **Decide where T20/ODI cricket is verified** (`CRICKET_RELEASE_DECISION.md`):<br>- (a) Workers Paid (+$5 a month, no code);<br>- (b) verify on Railway, as the avatar processor already works (a signed job from the Worker, then replay on Node) | (b) keeps Workers Free and the $5 total | (a) none; (b) 2–4 days, plus tests | Plan choice; for (b), code and a realtime deploy | (a) downgrade the plan; (b) revert, and cricket submissions return to the Worker |
| 0.5 | Optional: **cut Bumper Blitz's broadcast size:**<br>- quantised positions;<br>- deltas, or only the changed fields;<br>- one shared message instead of six near-identical views.<br>Server simulation and rules stay unchanged | The largest bandwidth driver, two-thirds of egress | 3–5 days, with visual and network tests | Code change (protocol, not rules) | Revert |
| 0.6 | **Collect the missing metrics** (`INFRASTRUCTURE_COST_BREAKDOWN.md`) and re-run `node docs/infrastructure-cost-model.mjs` with them | Replaces assumptions with facts | 1 hour of dashboard reading | — | — |

## Phases 1–8: Durable Objects (only if `INFRASTRUCTURE_COST_DECISION.md`'s conditions change)

| Phase | Goal | Work | Exit gate | Effort | Rollback |
|---|---|---|---|---|---|
| **1. Isolated local prototype** | Prove the model | In a new workspace package (no production config):<br>- a Worker that verifies the existing realtime token and routes `/rt/room/:code` to a `RoomObject` (Hibernation API);<br>- a `Matchmaker` object;<br>- run one turn-based game (Token Trail) end to end in local workerd via `wrangler dev`, with the existing engine unchanged | Two local browsers create, join, play and finish Token Trail; results go to a local `*_test` database | 1.5 weeks | Delete the package; production is untouched |
| **2. Protocol and room lifecycle** | Match today's behaviour | Reproduce:<br>- acknowledgements with timeouts, idempotent action ids, `seq` / `room:sync` resync, reconnect grace (60 s), host hand-over, kick, auto-start, sweeps;<br>- per-category rate limits, the per-IP cap (Worker), the account guard and bans;<br>- "session replaced" and one room per player (through the matchmaker index);<br>- hibernation with state saved to SQLite for turn-based rooms; alarms for deadlines; `setTimeout` ticks for real-time rooms.<br>Port the 61 realtime integration tests to the new transport | Ported tests pass. Reconnection after hibernation, after a deploy and after a killed socket is tested | 2 weeks | As phase 1 |
| **3. Load test** | Measure the real cost drivers | Local workerd, with synthetic clients for each game at 10/50/100 concurrent rooms. Record wall-time awake per room, messages and CPU | Measured GB-s and requests per room-hour replace assumptions A2–A4 and A8 | 0.5–1 week | — |
| **4. Cost comparison** | Decide with data | Re-run the model with phase 3's figures and Railway's real metrics (0.6), after 0.1's compression is live | Durable Objects are cheaper for the expected load, or the migration stops here | 2 days | Stop: nothing deployed |
| **5. Preview, isolated** | First real Cloudflare run | Needs Workers Paid, or Free with Durable Object limits in mind. Deploy the realtime Worker as a **separate Worker** to a Preview, with its own `AUTH_SECRET` and an **isolated Neon branch**, never production's (`CRICKET_PREVIEW_VALIDATION_PLAN.md` explains why isolation must be proven) | Preview matches play. Observability shows GB-s, requests and CPU matching phase 3. No production data touched | 3–4 days | Delete the Preview Worker and the Neon branch |
| **6. One low-risk game in production** | Real players, limited blast radius | Route **Token Trail** (turn-based, 2–4 players, hibernates well) to the new realtime Worker with a per-game client switch. Everything else stays on Railway | Two weeks: no rise in disconnects or failed matches; results, coins and achievements identical in kind; cost as forecast | 1 week + 2 weeks' soak | Flip Token Trail's switch back to Railway: one deploy, no data migration, because results already go to the same Neon tables |
| **7. Remaining games** | Move the rest | Color Clash, Chef Rivals and Doodle Duel, then Kitchen Rush Co-op, then **Bumper Blitz last** (20 Hz, latency-sensitive, never hibernates). Also matchmaking across games, admin metrics and kicks | Each game soaks a week before the next. Bumper Blitz latency is no worse for typical players | 1.5 weeks + 4–5 weeks of soaks | The per-game switch back to Railway (Railway still running) |
| **8. Retire Railway** | Remove the fixed $5 | **Only after:**<br>- every game has run 30 days on Durable Objects;<br>- the avatar processor is replaced (browser-side normalisation plus server validation, or a WebAssembly codec), if avatars are wanted;<br>- `/api/health` and `/admin` point at the new service;<br>- `rt.sinversegames.com` DNS is repointed or removed.<br>Then stop the Railway service (don't delete it for 30 days) | A month's bill without Railway; no regressions | 1 week (mostly avatars) | Restart the stopped Railway service, flip the switches back, restore DNS |

**Total for phases 1–8:** about **6–7 engineering weeks**, about **3 months elapsed** with soaks.

**What stays out of reach on Durable Objects:**
- the HTTP long-polling fallback, unless it's rebuilt;
- one global place to see every room (that becomes the matchmaker object).

## Rollback principles

- **No data migration in any phase.** Railway and Durable Objects write the same Neon tables through the same `recordMatch`. Switching a game back never strands records.
- **Per-game routing switch.** One client setting (or a server-sent list) chooses Railway or the new Worker per game, so rollback is a configuration deploy, not a code revert.
- **Railway stays running** (and billed $5) until phase 8's gate, so every earlier phase can roll back in minutes.

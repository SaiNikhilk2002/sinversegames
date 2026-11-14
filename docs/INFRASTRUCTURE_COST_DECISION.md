# Infrastructure cost decision

**Recommendation:**
- **Keep the current architecture** (Cloudflare Workers + Railway + Neon).
- **Turn on WebSocket compression,** and fix the two cheap issues found.
- **Don't migrate to Durable Objects now.**

Your target of about $5 a month is achievable on the current architecture at today's scale. A Durable Objects migration would cost 6–7 engineering weeks and remove the long-polling fallback, to save at most $5 a month. And it would cost *more* than compressed Railway as the game grows.

**Basis:**
- **Code:** read at `17c58f4`.
- **Engine traffic:** measured with the real engines on 2026-11-14.
- **Prices:** official pages, read on the same day.
- **Not used:** no dashboard, invoice or production metric was accessible. Usage figures are labelled assumptions; see `INFRASTRUCTURE_COST_BREAKDOWN.md`.

Re-run the model with real numbers: `node docs/infrastructure-cost-model.mjs`.

## 1. Cheapest reliable architecture

**Cloudflare Workers (web, plus free static assets) + Railway Hobby (Socket.IO realtime, `perMessageDeflate` on) + Neon Free (PostgreSQL),** unchanged in shape.

- **About $5 a month** today, plus about $1 a month for the domain:
  - Railway Hobby's $5, which includes $5 of usage;
  - Workers Free;
  - Neon Free.
- **This stays $5 only if T20/ODI cricket is verified on Railway, not on the Worker.** Workers Free's 10 ms CPU limit can't verify a T20 or ODI.
  - The alternative is Workers Paid, for **$10 a month in total**.
  - Either way, first check Observability for `exceededCpu` on today's routes. If the Free plan is already hitting its limit, Paid is needed regardless.

**Why not the alternatives** (ranked by cost, then risk; `CLOUDFLARE_DURABLE_OBJECTS_ASSESSMENT.md`):

| Rank | Architecture | Monthly at today's scale | At 100 / 500 / 1,000 players (typical month) | Effort | Risk |
|---|---|---|---|---|---|
| 1 | **E: Workers Free + Railway (compression on, cricket verified on Railway) + Neon** | **$5** | $42 / $144 / $281, Workers Paid needed beyond about 250 players | 3–5 days | Low. Workers Free's CPU limit on other routes is unverified |
| 2 | **A: Workers Paid + Railway (compression on) + Neon**, the simplest path to T20/ODI | $10 | $47 / $144 / $281 | 1 day (compression only) | Low |
| 3 | **B: Workers Paid + Durable Objects + Neon**, Railway retired | $5 | $46 / $153 / $301 | 6–7 weeks; avatars need a new processor | **Medium–high:** no polling fallback; a rebuilt protocol; a single matchmaker object |
| 4 | **D: B + Hyperdrive + R2** | $5 | As B | B + 1 week | Higher: Hyperdrive may keep Neon awake (exhausting Free compute); its caching must be off |
| 5 | **C: A + Hyperdrive** | $10 | As A | 2–3 days | Same Hyperdrive risks, for an unmeasured gain |
| — | B on Workers **Free** with Durable Objects Free | $0 | Fails beyond about 10–15 concurrent players (daily limits produce **errors**, which break matches) | 6–7 weeks | **Not reliable** |
| — | Railway **without** compression (today's configuration) | $5–8 | $63 / $304 / $607 | — | Bandwidth-bound |

Each row's "at scale" figures include Neon Launch where Free runs out, and $5 for Workers Paid where it's needed.

## 2. Expected monthly cost by concurrent players (recommended architecture)

Typical month: average concurrency is 30% of the peak. Even game mix; about 4.2 players per room.

| Peak concurrent players | Workers | Railway (compression on) | Neon | **Total** | Notes |
|---|---|---|---|---|---|
| **10** | $0 (Free) | **$5.00** (usage about $4.15, within the included $5) | $0 (Free; about 91 CU-hours if active 12 h a day) | **≈ $5** | Without compression: about $8.25 (120 GB egress) |
| **100** | $0 (Free, about 36k requests a day) | $22 | **$20** (Launch: 24 h a day at 0.25 CU; Free is exceeded) | **≈ $42** | +$5 if Workers Paid |
| **500** | **$5 (Paid)** (about 180k requests a day exceeds Free) | $100 | $39 | **≈ $144** | Resend Pro (+$20) if email sign-ins exceed 100 a day |
| **1,000** | $5 (Paid) | $198 | $78 | **≈ $281** | Bumper Blitz is about two-thirds of the egress. Protocol optimisation (roadmap 0.5) is the next lever |

**Worst case:** if the peak lasted 24/7, multiply the Railway column by about 3.3 (`INFRASTRUCTURE_COST_BREAKDOWN.md`, upper-bound table).

**The Worker request estimates** assume about 50 Worker requests per player-hour (pages and APIs; static assets are free). That's unmeasured.

## 3. Railway: retain or replace?

**Retain.**
- It's the cheapest option at today's scale (its $5 floor) and, with compression, at every larger scale modelled.
- It runs today's tested protocol with its polling fallback.
- It also hosts the avatar processor, which Workers can't run.

**Revisit** if Railway's real invoices exceed about $25 a month *after* compression is on, and Workers Paid is already being paid. The Durable Objects phases 1–4 (local prototype, load test, cost comparison) would then cost about 4 weeks to settle the question with real numbers.

## 4. Is Workers Paid required?

**Not for the current site, as far as the repository shows.** But:
- **it is required to verify T20/ODI cricket on the Worker** (0.1–0.5 s of CPU against Free's 10 ms);
- it's required **if Observability already shows `exceededCpu`** on today's routes (unknown);
- it's required **at roughly 250+ concurrent players** for the 100,000-requests-a-day limit (an estimate).

The way to stay on Free and still release T20/ODI is to verify cricket on Railway (roadmap 0.4b, 2–4 days).

## 5. Does Neon Free remain sufficient?

**Yes, at today's scale.** Storage is far under its 1 GB limit (9 players and 8 matches recorded at the 2026-11-05 migration; the current size is unverified). Connections and egress are ample.

**The binding limit is 100 CU-hours a month.** That's exceeded once the database is awake more than about 13 hours a day.
- Steady play around the clock does it.
- So does **any uptime monitor polling `/api/health` more often than every 5 minutes.**
- Over the limit, Neon **suspends the database until the next month.** That's an outage, not a bill.

Move monitors to `rt.sinversegames.com/health`. Plan Neon Launch (about $20 a month at 24/7 × 0.25 CU) when activity becomes all-day.

## 6. Is Hyperdrive worthwhile?

**No, not now.**
- Compatibility with the app's `@prisma/adapter-pg` isn't confirmed by Cloudflare's docs (pg 8.23.1 meets its minimum).
- Its default query cache would serve stale sessions and balances, so it would have to be off.
- Its pooled connections may keep Neon from scaling to zero. Neon doesn't document this, but if true it would end Free sufficiency.
- The benefit is unmeasured.

The free alternative is one database client per request in the Worker (roadmap 0.3).

## 7. Is R2 worthwhile?

**Not for cost.**
- Game assets are already served free and unlimited as Workers static assets (31 MB; the largest file is 1.8 MiB).
- R2 is the right, near-free store **only if you decide to turn on custom avatars,** which are off in production today (no `AVATARS` binding).

## 8. Estimated migration effort

| Work | Effort |
|---|---|
| Phase 0 (recommended): compression, monitors, request-scoped database client, cricket verification on Railway | **3–5 days** |
| Phase 0.5 (optional): smaller Bumper Blitz broadcasts | 3–5 days |
| Durable Objects phases 1–8 (not recommended now) | **6–7 engineering weeks, about 3 months elapsed** with soaks |

## 9. Technical risks

| Risk | Where | Mitigation |
|---|---|---|
| **Neon compute suspended mid-month** (100 CU-hours) | Neon Free | Monitors off `/api/health`; watch CU-hours; Launch before the limit |
| **Workers Free CPU (10 ms) on existing routes** | Unverified | Check Observability for `exceededCpu` / 1102 |
| **One Railway replica:** a restart ends every live room | Railway (unchanged) | Deploy at quiet times. Durable Objects would isolate rooms, at the cost of the polling fallback |
| Bandwidth growth from Bumper Blitz | Railway egress | Compression now; protocol optimisation later |
| Compression memory and CPU per socket | Railway | No-context-takeover options; measure after enabling |
| Durable Objects: lost polling fallback, per-room location latency for 20 Hz play, a single matchmaker, avatar processing, the protocol rebuild | Only if migrating | Phases 1–5 measure before any production change |
| Daily hard limits (Durable Objects Free, Hyperdrive Free, Workers Free requests, Resend Free) | Free tiers | Errors, not bills: watch them, and move to paid tiers before they bind |

## 10. What needs your approval

1. **Turning on `perMessageDeflate`** on the realtime server (code change and Railway deploy; restarts live rooms).
2. **Where T20/ODI cricket is verified:**
   - **Workers Paid** (+$5 a month), or
   - **verification on Railway** (code change, 2–4 days, plus a Railway deploy).
   - Check Observability first.
3. **Uptime monitors** moved to `rt.sinversegames.com/health` (your monitoring tool).
4. **A request-scoped database client** in the Worker (code change and web deploy).
5. **Optional:**
   - Bumper Blitz broadcast optimisation (protocol change, rules unchanged).
   - Turning on custom avatars (an R2 bucket and binding).
6. **Reading the metrics** listed in `INFRASTRUCTURE_COST_BREAKDOWN.md`: Cloudflare plan and Observability, Railway usage and egress, Neon CU-hours, Resend, domain renewal. That would turn this model's assumptions into facts. Only you have dashboard access.
7. **Not recommended now, but yours to decide:** starting Durable Objects phases 1–4 (local only, about 4 weeks) to measure, without touching production.

**Nothing in this audit changed infrastructure, configuration, code, DNS, secrets or data.**

# SinverseGames: infrastructure cost breakdown

What the current architecture costs, what drives the cost as players grow, and what isn't known. Prices are from official pages read on **2026-11-14**; the sources are listed at the end.

**No dashboard or invoice was accessible, so actual usage and bills are unknown.** The model (`docs/infrastructure-cost-model.mjs`) uses measured engine traffic plus labelled assumptions; re-run it with real numbers.

## Current monthly cost (as stated by you, checked against published prices)

| Item | Plan (as you stated; not verified) | Fixed | Usage-based | Free allowance | Notes |
|---|---|---|---|---|---|
| Cloudflare Workers (web) | Free | $0 | — | 100,000 Worker requests a day; **10 ms CPU per request**; static assets free and unlimited | **The Free plan can't verify T20/ODI cricket**: 0.1–0.5 s of CPU per submission (`CRICKET_CLOUDFLARE_COMPATIBILITY.md`). Whether today's routes already exceed 10 ms is **unknown**: check Observability for `exceededCpu` |
| Railway (realtime) | Hobby (your $5–10 a month matches it) | **$5**, which includes $5 of usage | vCPU $20/month, memory $10/GB-month, **egress $0.05/GB** | The $5 credit | Billed as $5 plus anything above $5 of usage |
| Neon (PostgreSQL) | Free | $0 | — | **100 CU-hours per project per month**, 1 GB storage, 5 GB egress, scale to zero after 5 min | Over the compute or egress limit, compute is **suspended until next month** (data kept). Over storage, writes are blocked |
| Cloudflare DNS / zone | Free zone (assumed) | $0 | — | — | **Unverified** |
| Domain `sinversegames.com` | Registrar **unknown** | About $10–11 a year if at Cloudflare (at cost; the price isn't on the official page) | — | — | **Unknown.** Check the registrar and renewal date |
| Email (Resend) | Free, *if* configured | $0 | — | 3,000 emails a month, **100 a day** | Configuration **unknown**. Pro is $20/month once the daily limit binds |
| R2 | Not used (no binding) | $0 | — | 10 GB, 1M Class A, 10M Class B a month | See `R2_STORAGE_ASSESSMENT.md` |
| Google OAuth | — | $0 | — | — | — |
| Workers Builds, GitHub | Not priced here | Assumed $0 | — | — | **Unverified** |

**Current total, by your figures:** about **$5–10 a month**, all of it Railway, plus about $1 a month for the domain.

## What drives cost as players grow

Measured on 2026-11-14 (`INFRASTRUCTURE_CURRENT_ARCHITECTURE.md`):
- **Bandwidth, not CPU.** Engines use well under 1% of a core per room.
- **Bumper Blitz sends about 228 KB/s per 6-player room**, uncompressed (Socket.IO WebSocket compression is off by default).
- In an even game mix, a room averages about **0.23 GB of outbound traffic per active hour**.
  - On **Railway**, that's egress at $0.05/GB.
  - On **Cloudflare**, outgoing WebSocket messages and egress are free, but a Durable Object is billed **128 MB × wall-clock seconds while awake**.
- **The database:** Neon's compute hours grow with the hours *anyone* is active, not with player count.
  - The realtime server rechecks accounts every 5 s per active socket.
  - At the 0.25 CU minimum, 24/7 activity uses about 182 CU-hours, which exceeds Free's 100.

## Assumptions in the model (label them as such)

| # | Assumption |
|---|---|
| A1 | Rooms are spread evenly over the six multiplayer games |
| A2 | Bumper Blitz players send about 10 inputs a second (the limit is 30) |
| A3 | Co-op cooking: about 3 actions a second per player, each rebroadcasting a full view; Chef Rivals the same |
| A4 | Doodle: the drawer sends about 15 strokes a second of about 300 B, relayed to the other viewers |
| A5 | **Typical month:** average concurrency is 30% of the stated peak (evening-heavy play). The upper bound assumes the peak lasts 24/7 |
| A6 | Railway CPU: 0.02 vCPU idle, plus 0.25% of a core per active room (the measured engine CPU × about 25 for Socket.IO and JSON) |
| A7 | Railway memory: 180 MB base, plus 100 KB per connected player |
| A8 | A Durable Object room is awake for its whole active match (it can't hibernate while ticking). With hibernation, turn-based rooms (a third of the mix) cost no duration |
| A9 | One matchmaking/coordinator Durable Object: awake 25% of the time at 10 players, 100% above that |
| A10 | Each player connects twice an hour; 20 coordinator requests per room-hour |

Players per room average 4.17 (the matchmaker's target sizes). Inbound messages average 15.6 a second per room. Neon's minimum compute is 0.25 CU, rising to 0.5 CU at 500 players and 1 CU at 1,000 (an assumption).

## Results: monthly cost by peak concurrent players

**Typical month (A5)** (`node docs/infrastructure-cost-model.mjs`):

| Peak concurrent players | Average active rooms | **Railway** realtime (Hobby) | Railway **with WebSocket compression** | **Durable Objects** on Workers Paid (all rooms awake) | Durable Objects, turn-based rooms hibernating | Neon |
|---|---|---|---|---|---|---|
| 10 | 0.72 | **$8.25** (120 GB egress) | **$5.00** | $5.07 | $5.07 | **Free** (about 91 CU-hours if active 12 h a day) |
| 100 | 7.2 | $63 (1.2 TB) | **$22** | $36 | $26 | $20 on Launch (182 CU-hours; Free exceeded) |
| 500 | 36 | $304 (6 TB) | **$100** | $163 | $114 | $39 (0.5 CU, 24 h) |
| 1,000 | 72 | $607 (12 TB) | **$198** | $322 | $223 | $78 (1 CU, 24 h) |

**Upper bound: peak sustained 24/7:**

| Peak players | Railway | Railway + compression | Durable Objects (awake) | Durable Objects (hibernating turn-based) |
|---|---|---|---|---|
| 10 | $22 | $8.73 | $11 | $8.19 |
| 100 | $204 | $67 | $110 | $77 |
| 500 | $1,010 | $328 | $534 | $370 |
| 1,000 | $2,017 | $655 | $1,064 | $735 |

**The Durable Object figures include the $5 Workers Paid fee.** Railway's include the $5 Hobby fee, but **not** Workers Paid, which the T20/ODI release needs regardless.

**Reading:**
1. **Bandwidth dominates both platforms at scale.**
   - Turning on Socket.IO `perMessageDeflate` cuts Railway's cost about 3× (measured on Bumper Blitz messages).
   - That makes Railway the **cheapest at every scale modelled**, before any game-protocol optimisation.
2. **Durable Objects don't remove the cost; they move it to duration.**
   - A real-time room (Bumper Blitz, cooking, Doodle) must stay awake while it ticks.
   - At 128 MB per object, that's about 450 GB-s per room-hour. The included 400,000 GB-s covers about 890 active room-hours a month.
3. **At today's scale (single-digit concurrent players), everything costs about $5.** The question is only *who* the $5 goes to, and whether Workers Paid is needed anyway.
4. **Neon Free holds** while activity spans less than about 13 hours a day at 0.25 CU. Round-the-clock activity, or an uptime monitor hitting `/api/health`, exceeds 100 CU-hours. Compute is then suspended until the next month: an outage, not a bill.

## Durable Objects on the Workers **Free** plan

Durable Objects (SQLite-backed) are available on Workers Free, with **13,000 GB-s, 100,000 requests and 100,000 rows written a day**.
- **At 10 peak players in a typical month,** the model uses about 10,500 GB-s a day: inside the limit, with little headroom.
- **Above about 10–15 concurrent players,** the daily GB-s limit is exceeded. Cloudflare then **fails further operations with an error**, which would break matches mid-game.
- That's not reliable enough to depend on.

## Metrics needed to replace assumptions

| Service | Metric | Where (owner) |
|---|---|---|
| Cloudflare | The plan (Free/Paid); Worker requests a day; CPU time per invocation (p50/p99); count of `exceededCpu` / 1102 | Dashboard → Workers & Pages → `sinversegames` → Metrics / Observability |
| Railway | Last invoice; CPU and memory graphs; **network egress GB**; plan; region | Railway → project → Usage / Metrics |
| Realtime | `connections`, `rooms`, `playing`, `byGame`, `memoryMb` | `GET /admin/metrics` with `ADMIN_TOKEN` (read-only; not called here) |
| Neon | CU-hours used this month; min/max CU; autosuspend; storage; data transfer | Neon console → Project → Usage / Settings → Compute |
| Resend | Whether configured; emails a day | Resend dashboard |
| Domain | Registrar, renewal date and price | Registrar |
| Monitoring | Any uptime monitor: its URL and interval | Your monitoring tool |

## Sources (read 2026-11-14)

- **Cloudflare:**
  - [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (updated 2026-11-13): Paid "$5 USD per month" minimum; 10M requests and 30M CPU-ms included; +$0.30/M requests, +$0.02/M CPU-ms; no egress charges.
  - [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (2026-11-13): Paid 1M requests a month, then $0.15/M; 400,000 GB-s, then $12.50/M GB-s; **128 MB billed per object**; incoming WebSocket messages 20:1; "no charge for outgoing WebSocket messages"; idle hibernation-eligible objects aren't billed duration; Free: 100k requests and 13,000 GB-s a day, SQLite only.
  - [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/) (2026-06-18): Free 100,000 queries a day; Paid unlimited, no extra charge.
  - [R2 pricing](https://developers.cloudflare.com/r2/pricing/) (2026-10-30).
  - [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (2026-11-13).
  - [Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) (2026-11-12).
  - [Registrar](https://developers.cloudflare.com/registrar/): at cost.
- **Railway:** [pricing](https://railway.com/pricing) and [plans](https://docs.railway.com/reference/pricing/plans). Hobby $5 with $5 usage; memory $0.00000386/GB-s; CPU $0.00000772/vCPU-s; egress $0.05/GB; Free plan $1 a month of credit, 0.5 GB / 1 vCPU.
- **Neon:** [pricing](https://neon.com/pricing) (2026-11-04) and [plans](https://neon.com/docs/introduction/plans) (2026-11-12).
  - Free: 100 CU-hours per project, 1 GB storage, 5 GB egress, scale to zero after 5 min.
  - Launch: $0.106/CU-hour, $0.35/GB-month. The exceeded-limit behaviour came from a summarised part of the page.
- **Resend:** [pricing](https://resend.com/pricing). Free 3,000 a month, 100 a day; Pro $20.
- **Socket.IO:** [server options](https://socket.io/docs/v4/server-options/). `perMessageDeflate` default `false`.

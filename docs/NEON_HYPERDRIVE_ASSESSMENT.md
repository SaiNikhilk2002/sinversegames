# Neon and Hyperdrive assessment

Is Neon Free enough, how does the app connect today, and would Cloudflare Hyperdrive help? Read-only: no Neon setting, Hyperdrive configuration or database was created or changed. PostgreSQL and all player data stay as they are. **D1 is not considered.**

## How the app connects today (from the code)

| Runtime | Client | Connection | Pool |
|---|---|---|---|
| Worker (`apps/web`) | Prisma 7.10.1 + `@prisma/adapter-pg` 7.10.1, `pg` 8.23.1 (`packages/db/src/client.ts`) | Neon **pooled** URL (`-pooler`, PgBouncer), TLS (`DEPLOYMENT.md` § 2) | **A new `PrismaClient` and `pg` pool (max 1) on every `getDb()` call.** Workers can't reuse a socket across requests. There are 30 call sites in 22 files; `lib/server/session.ts` alone calls it up to 4 times, so one request can open several connections |
| Realtime (Railway) | Same packages | Neon pooled URL | One cached client, pool `DATABASE_POOL_MAX` (default 5) |
| Migrations | Prisma CLI | Neon **direct** URL, in a temporary terminal only | — |

**Deadlines:** connect 2.5 s, statement 5 s, client query 6 s (`CLAUDE.md`, expansion phase).

**Smart placement** (`wrangler.jsonc`) runs the Worker near the database, so each connection's round trips are short.

## Is Neon Free sufficient?

Neon Free, per [the pricing page](https://neon.com/pricing) (2026-11-04) and [plans](https://neon.com/docs/introduction/plans) (2026-11-12):
- 100 CU-hours per project per month, autoscaling 0.25–2 CU;
- scale to zero after 5 minutes (can't be disabled);
- 1 GB storage per project;
- 5 GB public egress per month;
- up to 10,000 pooled connections;
- 6 hours of instant restore.

| Limit | This app | Verdict |
|---|---|---|
| Storage, 1 GB | 9 players and 8 matches at the 2026-11-05 migration. Rows are small: a cricket result's details are at most about 8 KB | **Ample** for years at this growth |
| Egress, 5 GB | Query results only. Static files and game traffic don't touch Neon | **Ample** |
| Connections | Pooled, about 10,000 | **Ample** |
| **Compute, 100 CU-hours** | The compute is awake whenever anything touches the database:<br>- page requests;<br>- `/api/health` (`SELECT 1`);<br>- realtime connects;<br>- **an account recheck every 5 s per active socket** during play;<br>- match results.<br>At 0.25 CU: 12 hours a day ≈ 91 CU-hours (fits); 24 hours a day ≈ 182 (doesn't) | **Sufficient while the database is awake less than about 13 hours a day, at 0.25 CU.** Over the limit, Neon **suspends compute until the next month**: the site loses its database (data is kept). **Upgrade or reduce wake-ups before that** |
| Instant restore, 6 hours | — | A thin safety net. Take Neon snapshots, or a `pg_dump`, before risky changes |

**Hidden risk: monitoring.** `DEPLOYMENT.md` § 7 suggests "uptime monitoring on both health URLs".
- A monitor on `https://sinversegames.com/api/health` runs a database query on every check.
- **Checking more often than every 5 minutes keeps Neon awake 24/7:** about 182 CU-hours, over the Free limit.
- **Point monitors at `https://rt.sinversegames.com/health`** (no database), or at a static page. Whether such a monitor exists is **unknown**.

**What it would cost after Free:** Neon Launch, pay as you go, at $0.106 per CU-hour and $0.35 per GB-month:
- 24/7 at 0.25 CU ≈ **$20 a month**;
- at 0.5 CU ≈ $39;
- at 1 CU ≈ $78.

## Hyperdrive

**What it is:** Cloudflare-managed connection pooling, plus query caching, between Workers and a PostgreSQL database.
- Free: 100,000 queries a day.
- Paid: unlimited, at no extra charge ([pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/), 2026-06-18).

| Question | Finding |
|---|---|
| Compatible with this app's driver? | **Probably, not proven.** Hyperdrive supports `pg` 8.16.3 or later; the app has 8.23.1. But Cloudflare's [Prisma guide](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/prisma-orm/) (2026-11-10) documents a different package (`@prisma/orm-postgres`), not `@prisma/adapter-pg`. A local prototype would have to confirm it |
| Which Neon URL? | Cloudflare's [Neon guide](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/) says to use the **direct** (non-pooled) string. Hyperdrive does the pooling |
| Benefit | It saves the per-request TCP, TLS and Postgres authentication handshake, and makes several clients per request cheap. **Not measured:** no production latency data was available. With smart placement already near Neon, the saving is likely a few to tens of milliseconds per request |
| **Caching risk** | Hyperdrive caches popular `SELECT`s by default. This app reads sessions (revocation), wallet balances, bans and rate-limit rows, where a stale read is wrong or unsafe. **Caching would have to be turned off,** leaving only pooling |
| **Neon scale-to-zero risk** | Hyperdrive keeps a pool of connections to the database. Neon's docs **don't say** whether idle open connections prevent scale to zero ([scale to zero](https://neon.com/docs/introduction/scale-to-zero), 2026-11-04). If they do, Hyperdrive would keep the compute awake 24/7: about 182 CU-hours, **ending the Free plan's sufficiency**. Unverified, so it must be tested first |
| Free-plan quota | 100,000 queries a day. A page view runs several queries (session, profile, wallet…), so the cap could be reached at around 10,000–20,000 page views a day |
| Cost | $0 extra on either plan |

**Verdict: not worthwhile now.**
- Its benefit is unmeasured.
- It risks the Neon Free compute budget.
- Its caching must be disabled.
- A free code fix gets most of the pooling benefit: **create one database client per request** (cache `getDb()` per request, as was done for `/api/solo/submit` in `afe2289`), so a page opens one connection, not up to four.

**Revisit Hyperdrive** if Observability shows database connection time dominating response times on the Paid plan. Then prototype it locally first (Wrangler supports a `localConnectionString`), and check Neon's compute graph for scale to zero with Hyperdrive attached.

## Is any database change necessary?

**No.** Keep Neon PostgreSQL, Prisma and the existing data. Recommended, all without schema changes:
1. Keep uptime monitors off `/api/health` (or poll it no more than every 30 minutes).
2. Reuse one database client per request in the Worker (a code change, with approval).
3. Watch Neon's monthly CU-hours. Plan Launch (about $20 a month at 24/7 × 0.25 CU) before Free runs out, because over the limit the database is **suspended, not billed**.

**What doesn't help:** slowing the realtime account recheck (every 5 s per socket). Neon only scales to zero after 5 minutes with *no* queries, and any match touches the database far more often than that. Neon's compute hours follow **the hours in which anyone plays or browses**, not the query rate.

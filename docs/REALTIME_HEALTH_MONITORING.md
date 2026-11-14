# Health monitoring without waking the database

Neon Free gives 100 compute-hours a month, and its compute sleeps after 5 minutes with no queries. A monitor that queries the database more often than every 5 minutes keeps it awake around the clock: about 182 CU-hours a month at the 0.25 CU minimum. Over the limit, Neon **suspends the database until next month.**

## The endpoints (commit `316ee1f`)

| Endpoint | Checks | Touches the database? | Use for |
|---|---|---|---|
| `https://rt.sinversegames.com/health` | The realtime process and its HTTP server answer. Returns `{ status, uptimeSeconds }` | **No** (a test pins this: no persistence call at all) | **Uptime monitoring of realtime, any interval (1–5 min).** It's also Railway's own health check (`railway.json`) |
| `https://sinversegames.com/api/health/live` (**new**) | The Worker answers. Returns `{ status: "ok", web: "ok" }`, `no-store` | **No**, and no call to realtime | **Uptime monitoring of the website, any interval.** Each check is one Worker request (288 a day at 5 min, against Free's 100,000) |
| `https://sinversegames.com/api/health` | Readiness: `SELECT 1` on Neon, and a fetch of realtime's `/health`. 503 if either is down | **Yes** | Occasional dependency checks only, **every 30 minutes or more**, or by hand. More often than every 5 minutes keeps Neon awake |
| `https://rt.sinversegames.com/admin/metrics` | Rooms, connections, verification counters, and database health | **Yes** (`SELECT 1`) | Needs `ADMIN_TOKEN`. Rare, manual |

**Separation:**
- **Process health:** `/health` and `/api/health/live`.
- **Realtime transport:** `/health` shows the HTTP server is up. A full WebSocket check would need a signed token, so it isn't suitable for a public monitor. Socket problems show up in `/admin/metrics` and real use.
- **Database readiness:** `/api/health`.

## Recommendation (not applied: no monitor was changed or created)

- Monitor **`https://rt.sinversegames.com/health`** and **`https://sinversegames.com/api/health/live`** every 1–5 minutes.
- If you also want database readiness, check `/api/health` **every 30 minutes or more.** At 30 minutes, each check wakes Neon for about 5 minutes: about 1/6 of the day, roughly 30 CU-hours a month at 0.25 CU.
- **Avoid** pointing a frequent monitor at `/api/health` or `/admin/metrics`.

## What else wakes Neon (unchanged, expected)

These cost compute-hours in proportion to the hours someone uses the site, not to how often they query:
- page views and API calls;
- realtime connects;
- the 5-second account recheck while a socket is active;
- match results.

## Tests

- `apps/realtime/test/health.test.ts`: `/health` and `/` answer 200 with only `status` and `uptimeSeconds`, and **never call the persistence layer**. `/admin/metrics` needs the token and does check the database.
- `apps/web/e2e/health.spec.ts`: `/api/health/live` answers `{ status: "ok", web: "ok" }` with `no-store`. `/api/health` still reports `web`, `database` and `realtime`.

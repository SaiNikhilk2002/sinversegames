# Sinverse Cricket: server verification performance

How much CPU the server spends verifying an international match, what was improved, and what isn't known.

**Environment:**
- Measured on 2026-11-13: Windows 11, RTX 3050 Laptop (the CPU is what matters here), Node 24.14.0, single thread.
- **These are local Node numbers. They are not Cloudflare Worker measurements, and they don't show that any Worker CPU limit is met.**

## Method

`packages/engines/bench/cricket-verify.ts`, run two ways, with the same seeds and code in both columns of each table:
- **Direct:** `node --import <the workspace's tsx loader>`, the main table below.
- **Package script:** `CRICKET_MATCHES=10 pnpm --filter @platform/engines bench:cricket`, which runs it through vitest (a declared dependency, so it works on a fresh install). Vitest's module runner makes every figure about 1.8–1.9× higher, so compare within a table, never across.

The benchmark:

1. **Build the logs.** For each case it builds deterministic match logs the way the browser does: the player's own deliveries with real digests and pacing, plus simulated passages.
2. **Time the server's work.** It times exactly what `POST /api/solo/submit` does after authentication: `JSON.parse` of the body, the log schema, and `sinverseCricket.verify` (log shape, timeline, full replay, summary).
3. **Measure.** CPU is `process.cpuUsage` (user + system). On Windows its resolution is about 15.6 ms, so very small figures, such as the duel's, read as 0 or 16–47 ms. Wall time comes from `performance.now()`. Heap growth is reported but is noisy, because garbage collection isn't forced. Body size is the JSON submitted.
4. **Cases:**
   - **sim:** everything simulated with "Simulate innings".
   - **mixed:** the player plays every 3rd over.
   - **bowl-all:** the player bowls every ball of the opposition's innings. This is the worst case, because every delivery is batted by the AI, which judges its runs by probing the struck ball.
   - **bat-all:** the player bats every ball of their innings.
5. **Seeds and repeats.** The same seeds and team pairs are used in both columns, with 10 matches per case and county or elite difficulty alternating. The "before" column ran the exact same script against an export of commit `98dca74` (`git archive`, no worktree), on the same machine, the same day, one run after the other.

## Results, direct: CPU ms per verification (median / p95 / max)

| Case | Deliveries (median) | Before (`98dca74`) | After | Change in median |
|---|---|---|---|---|
| T20 simulated | 239 → 232 | 203 / 219 / 219 | 109 / 188 / 188 | −46% |
| T20 mixed | 207 → 196 | 156 / 188 / 188 | 94 / 172 / 172 | −40% |
| T20 player bowls all | 235 → 237 | 203 / 250 / 250 | 110 / 141 / 141 | −46% |
| T20 player bats all | 168 → 161 | 109 / 141 / 141 | 63 / 78 / 78 | −42% |
| ODI simulated | 587 → 603 | 500 / 578 / 578 | 281 / 313 / 313 | −44% |
| ODI mixed | 412 → 393 | 344 / 390 / 390 | 156 / 203 / 203 | −55% |
| **ODI player bowls all (worst case)** | 585 → 593 | 547 / 626 / 626 | **281 / 328 / 328** | −49% |
| ODI player bats all | 280 → 267 | 172 / 266 / 266 | 109 / 156 / 156 | −37% |
| Duel, 1 and 2 overs (reference, shipped) | 12 / 24 | Under the timer's resolution (≤ 47 ms max) | Same | — |

Delivery counts differ slightly between the columns, because the AI improvements change how matches unfold. The per-delivery reduction is about the same as the table shows.

### Same comparison through the package script (vitest)

| Case | Before (`98dca74`) | After | Change in median |
|---|---|---|---|
| T20 simulated | 406 / 454 / 454 | 188 / 250 / 250 | −54% |
| T20 player bowls all | 375 / 499 / 499 | 203 / 250 / 250 | −46% |
| ODI simulated | 907 / 1063 / 1063 | 500 / 547 / 547 | −45% |
| ODI mixed | 625 / 703 / 703 | 297 / 359 / 359 | −52% |
| **ODI player bowls all** | 985 / 1125 / 1125 | **531 / 578 / 578** | −46% |
| ODI player bats all | 359 / 500 / 500 | 203 / 266 / 266 | −43% |

The previous report's "about 1 s for an ODI" was measured under vitest, and matches the "before" column here.

**Wall time** tracks CPU (single-threaded): the worst ODI case went from 527–613 ms to 276–324 ms.

**Payload:**
- A fully simulated match submits under 1 KB of log.
- The worst case (every opposition ball bowled by the player) is about 55 KB for an ODI and 22 KB for a T20, well under the 512 KB limit.

**Memory:** heap growth during one verification stayed under about 56 MB in every case. This is noisy, since no garbage collection was forced between runs.

## What was changed, without trusting the client more

Profiling showed that about 80% of verification time is the ball-flight physics. Most of it came from the AI batter judging runs: for each delivery it replayed the struck ball from release once for "no run", then for one, two and three runs, plus a "risky" extra run.

1. **Running plans branch from a checkpoint.**
   - Every plan is identical until its first run call, 18 ticks after contact, so the plans now continue from an exact copy (`Delivery.fork`) of the flight at that tick, instead of from release.
   - Each longer plan continues from the previous plan's copy at its extra call.
   - `fork` copies all the state, including the random generator. A `DeliveryRng` reproduces `seededRng`'s mulberry32 sequence exactly, with its state exposed.
   - It refuses to fork once a call has been processed or passed.
   - **Proof:** a regression test checks that a forked delivery gives the same digest, tick, outcome and chaser as a fresh one. The 1,000-match stress run verifies every match exactly. The v1 golden corpus is unchanged.
2. **Each plan is simulated once,** and on the server (no capture) the probe of the chosen plan *is* the delivery, so it isn't simulated again. The browser, which renders frames, still runs its own captured delivery. Outcomes are identical either way.
3. **No allocation per physics tick:** the digest no longer builds an array, and the previous ball position uses a scratch vector. The arithmetic and the order of the digest are unchanged; the golden corpus proves it.
4. **Impossible pace is refused before the replay.** `/api/solo/submit` checks a cricket log's last game time against real time since the run started before replaying it, instead of after. It's the same rule, so a valid run is never affected.

**Not changed:**
- the physics integrator's arithmetic, since changing it would change every recorded duel;
- the authoritative full replay;
- the database reads (one transaction, as before).

A duplicate submission is still detected by the unique run id after verification. A pre-check would add a database read to every submission, to save CPU only on rare duplicates, which are also rate-limited.

## Cloudflare: what is and isn't known

- `wrangler.jsonc` sets no `limits.cpu_ms`, and the repository doesn't say which Workers plan the account uses.
- **Workers Paid:** a default limit of 30 s of CPU per request, configurable up to 5 minutes. Locally, the worst ODI verification uses about 0.3 s directly, or about 0.55 s under vitest's module runner. Worker CPU differs from a laptop's Node, so measure it on a preview before you rely on it.
- **Workers Free:** a 10 ms CPU limit. That isn't enough even for a T20 (about 60–190 ms locally).

**If the limit turns out to be tight, the options are:**

| Option | Effect | Needs |
|---|---|---|
| A. Confirm Paid and set `limits.cpu_ms` explicitly | Simplest. Keeps verification on the Worker | Your check of the plan; a one-line config change |
| B. Verify version-2 cricket on the Railway realtime service | Node has no per-request CPU cap. The Worker forwards `{seed, config, log}` with a short-lived signed job, as avatars already do (`REALTIME_INTERNAL_URL`), and persists the result | A new internal endpoint and deployment of the realtime service. No schema change |
| C. Verify in segments (as proposed for Test cricket) | Bounded CPU per request | The Test-cricket persistence work (migration) |

**Not recommended:** trusting client summaries, sampling deliveries, or skipping the AI's replay. Any of these would let a modified browser award itself results.

## Reproduce

```sh
CRICKET_MATCHES=10 pnpm --filter @platform/engines bench:cricket     # verification CPU, wall, heap, payload (under vitest)
CRICKET_MATCHES=40 pnpm --filter @platform/engines bench:balance     # AI balance by difficulty (see CRICKET_AI_OPPONENT_REPORT.md)
CRICKET_MATCHES=500 pnpm --filter @platform/engines stress:cricket   # 500 T20 + 500 ODI stress run (the default)
```

The direct figures above came from `node --import <workspace tsx loader>/dist/loader.mjs bench/cricket-verify.ts 10`. `tsx` is installed in this workspace for `apps/realtime`, but it isn't linked into a fresh install of `packages/engines`, which is why the package scripts use vitest.

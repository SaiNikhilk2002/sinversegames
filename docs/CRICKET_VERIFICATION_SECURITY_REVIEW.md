# Cricket verification on Railway: security review

Scope: the new path (`CRICKET_VERIFIER_URL` set) from `CRICKET_RAILWAY_VERIFICATION_DESIGN.md`. The earlier review of the submit path (`CRICKET_SECURITY_RELEASE_REVIEW.md`) still applies to everything the Worker keeps.

**Result: no client-trust was added, and no earlier protection was weakened. Two protections are stronger than before.**

## What a client can and can't influence

The browser still sends only `{ run token, log }`.

| A modified client tries to… | Stopped by |
|---|---|
| Claim runs, wickets, a scorecard, a result, statistics or rewards | It can't send them: the result is computed by the replay. The Worker persists only a result inside a verdict signed for its own job |
| Submit someone else's run | The Worker refuses (`run.sub !== session`, 403). Railway also refuses if the job's player doesn't own the run token (403). Browser test: "a run belongs to the player who started it" |
| Change the log after the Worker checked it | The job is bound to SHA-256(run token + log). Any byte changed → 401 `job_mismatch` (test) |
| Tamper with a delivery to change its outcome | The replay recomputes every delivery's digest → 422 (test) |
| Replay a failed log, or try another log under the same run | Railway remembers refused runs, service-wide → 422 without replaying (test). The Worker's per-isolate memo answers first |
| Resubmit a saved match | The Worker's primary-key check → 409 before any replay; the database's unique match id makes double rewards impossible (unchanged) |
| Call `/internal/cricket/verify` directly | Without a job signed with the server secret → 401 (tests: missing, forged, expired) |
| Reuse a captured job | One-use ids → 401 `job_replayed` (test). Jobs last 60 s and travel only server to server over HTTPS |
| Use a token meant for something else | Jobs, verdicts, avatar jobs, run tokens and session tokens each have their own audience and purpose. An avatar job can't authorise a verification, and a job isn't a verdict (tests) |
| Run tokens for another game, or not signed by the web app | → 400 (tests) |
| Exhaust Railway with expensive replays | A 512 KB body limit (413), a queue of 8, 2 per player, 15 s per replay, and refused runs never replayed. The Worker's rate limits come first, and the pace pre-check means a full crafted log first needs about 3 hours of real waiting. **Replays run in a worker thread, so live multiplayer rooms aren't delayed** (event-loop delay about 11 ms, the monitor's resolution, during a 1.7 s crafted replay) |

## Binding the verdict to the submission

A verdict carries `job`, `run` and `hash`. The Worker accepts it only if all three equal what it sent. So a verdict produced for one request, player or run, even a genuine one, can't be attached to another. Verdicts expire after 60 s.

## Secrets and transport

- **No new secret.** `AUTH_SECRET` is already shared by the Worker and Railway (`DEPLOYMENT.md`), and is already used for avatar jobs.
- **Transport:**
  - `CRICKET_VERIFIER_URL` must be `https:` (or loopback `http:` for tests); otherwise the Worker refuses to send.
  - `redirect: "error"` stops a redirect leaking the run token.
- **Logging:**
  - No tokens, logs or payloads are logged.
  - Railway logs fault events with the run id.
  - The Worker logs only status codes and short error codes.

## Durable vs process-local protections

| Protection | Before | Now |
|---|---|---|
| Refused runs | Per Worker isolate (in memory) | Per isolate **plus** service-wide on Railway (one replica, in memory). It resets when Railway restarts; a durable list would need a migration, which isn't justified given how much a crafted log costs to build and wait for |
| One-use jobs | — | Service-wide on Railway, for 120 s, longer than a job's 60 s life. A restart forgets them, but they'd also have expired by the time a restart completes plus a captured job was replayed, and capture requires breaking TLS |
| Duplicate saves | Database unique key (durable) | Unchanged |

**If Railway ever runs more than one replica:**
- one-use jobs could be replayed once per replica, which only costs CPU and decides nothing;
- refused runs would be remembered per replica.

Both would need shared storage then. `railway.json` pins one replica.

## Residual risks

1. **Railway becomes part of cricket's save path.** If it's down, cricket results answer 503 and can be retried; nothing is lost or misrecorded.
2. **A Railway restart forgets refused runs and used jobs.** That's bounded, as above.
3. **Engine version skew during a deploy.** It refuses runs rather than accepting wrong ones (422). Deploy Railway first; keep the two in step.
4. **Unchanged from before:** tool-assisted play (a bot submitting a plausible, possible match) isn't detected by replay.

## Tests

- **Shared** (`packages/shared/test/cricket-verify.test.ts`, 5 tests): hash binding, a fresh job id each time, forged / foreign-audience / expired jobs refused, malformed claims refused, and verdict bindings for job, run and request.
- **Realtime** (`apps/realtime/test/cricket-verify.test.ts`, 13 tests):
  - a T20 verdict equals the local `verify` result;
  - the duel (v1) works;
  - jobs that are missing, forged, expired (and the same claims accepted when fresh), or replayed;
  - a log changed after the job;
  - another player's run, and a job for another run;
  - another game's run, and a run token not signed by the web app;
  - a tampered delivery, then the same run never replayed;
  - an oversized body;
  - concurrent submissions and a full queue;
  - the per-player limit;
  - the event loop responsive during an ODI;
  - a timed-out thread replaced, with a 503 that isn't remembered as a refusal.
- **Browser** (`cricket-release.spec.ts`), plus every cricket spec run with `CRICKET_VERIFIER_URL` set (final report):
  - cross-player submission refused, and the owner's later submission still accepted;
  - a rejected run stays rejected;
  - a saved run is a duplicate.

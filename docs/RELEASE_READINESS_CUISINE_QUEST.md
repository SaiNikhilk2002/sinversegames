# Release readiness: Cuisine Quest multiplayer

Audit date: 2026-11-07. Branch `feature/cuisine-quest-showdown`.

Nothing has been pushed, merged or deployed. Production, Railway, Cloudflare, Neon and secrets weren't changed. The Cricket 2 worktree wasn't touched, and the root `AGENTS.md` and `CLAUDE.md` are unchanged.

## Recommendation

**Not ready for Preview from this branch as it stands.** It's ready for code review and local playtesting. Three blockers, all about release infrastructure rather than gameplay:

1. **Cloudflare configuration on `main` is the old one.** This branch is based on `main` (`2aeab76`), whose `wrangler.jsonc` names the Worker `sinversegames-web` and has no artifact check. The Worker identity fix, artifact gate and Preview script fixes are only on PR #4. A hosted Preview built from this branch would hit the same Worker mismatch PR #4 was diagnosing. PR #4 needs to land on `main` first, then this branch rebases onto it.
2. **There's no realtime service to test the new modes against.** Production realtime runs `2aeab76` (evidence below), which doesn't know `chef-rivals`, `kitchen-rush-coop`, `kitchen:act` or `kitchen:tap`. A hosted web Preview compiled with the production realtime URL would show the new modes, but creating a room would fail. Testing them on a hosted Preview needs a non-production realtime service on Railway running this branch, with an exact `ALLOWED_ORIGINS` entry for the Preview host. That's an infrastructure decision for the owner.
3. **Preview-only secrets and data.** The Preview needs Preview-only `AUTH_SECRET` and database values, so it creates no production players, matches or rewards. These are owner-managed and unverified.

**Ready for production after Preview?** Not yet assessable. It needs a green hosted Preview with web and a matching realtime service, then a release order of realtime first and web second, and real-device checks.

## Evidence

### Git

| Item | Value |
|---|---|
| Base | `main` = `origin/main` = `2aeab76` (PR #3 merge) |
| Commits | 8 local commits on top: `77103fb`, `c4210f8`, `61e7dae`, `06ef383`, `0a1367c`, `54414fd`, `17cc665` and `96945ec` (duel actions shown only after server confirmation), plus the audit-fix commit that adds this report |
| Overlap with Cricket 2 | At the last check, no files changed by both branches |

### Full browser suite (one complete run)

| Result | Count |
|---|---|
| Passed | **92** |
| Failed | **0** |
| Skipped | **1**, the opt-in Cricket evidence capture |
| Total | 93 cases |
| Duration | 30.3 minutes |

Run details:

- **Code:** commit `96945ec`, after a fresh production build.
- **Retries:** off, so nothing passed on a second attempt.
- **Environment:** a worktree-owned PostgreSQL on loopback, `*_test` databases, a fresh test-only `AUTH_SECRET`, the local Google identity fixture, and the local email fixture with its correct key.

The run covered:

- The full seven-kitchen campaign.
- Chef Rivals between two browsers, including 1280×720 and a phone.
- Kitchen Rush Co-op between two browsers, including a phone.
- Mode menu, routing, low effects and reduced motion.
- Email and identity flows, with fixtures only.
- Every other game, including all Cricket specs.

The Cricket specs overwrite tracked images, so I restored them with `git restore` as documented.

**Changes after the full run.** The audit then found two layout and contrast issues, fixed with CSS only:

- Rivals at 1280×720 needed scrolling to reach the second row of ingredients.
- The recipe-book label had low contrast on light paper.

After those fixes:

| Check | Result |
|---|---|
| Multiplayer, campaign and journey specs | 15 of 15 passed |
| Audit's live-match pass | Passed |

The full suite wasn't rerun after these CSS-only changes.

### Non-browser checks

| Check | Result |
|---|---|
| Typecheck, five packages | Pass |
| Unit and real-socket integration | 532 pass: shared 32, engines 439, realtime 61 |
| Real-socket multiplayer, within the 61 | Rivals 9: full duel, live activity, retry once, forged and stale input, reconnect, early leave, matchmaking for both games, rematch. Co-op 5: shared kitchen, four simultaneous plate grabs, a handed-off order served once and saved once, forged input, drop and timeout |
| PostgreSQL (`test:db`) | 65 pass |
| Node production build | Pass |
| Linux OpenNext build | Pass in WSL from a git archive of the branch (Node 24.14.0, pnpm 11.15.1, frozen install in 12 s): `cloudflare:build` 86 s, `worker.js` produced, 118 static assets |
| Packaging dry run | `cloudflare:preview:check` packaged the Worker locally: 23,979 KiB, 6,346 KiB gzipped. Nothing was uploaded |
| Artifact marker | Not present on this branch. It's only on PR #4 |

The dry run isn't a hosted Preview, and `cloudflare:deploy` and `cloudflare:preview:deploy` weren't run.

### Multiplayer behaviour verified

| Requirement | Rivals | Co-op |
|---|---|---|
| Separate identities over real connections | Two browser contexts, plus signed socket clients | Two browser contexts, plus 2-4 socket clients |
| Identical conditions | Same theme, ingredient and tickets in both browsers | One shared kitchen |
| Concurrent actions, validated by the server | Yes | Yes. First tap wins a station, cooked food or plate |
| Score computed by the server | Totals identical in both browsers | One team score, identical everywhere |
| Duplicate settlement prevented | One recorded match per room, retried actions applied once | Triple serve gives one order, one save |
| Reconnect | Exact kitchen restored after reload | Seat held, then plate freed on timeout |
| Rematch | Fresh match in the browser | Covered by the shared lobby |

**Visual state follows the server.** Duel actions now appear only after a server view. A copy is used only to reject impossible moves instantly, and sounds follow confirmed events. Co-op chef positions, carried items and plate holders come only from server state.

3-player co-op is covered by socket tests, and 4 players by engine and socket tests. Browser tests use 2 players.

### Responsive, accessibility and light mode

The audit measured 102 screens:

- Viewports: 320, 360, 390, 430, 768, 1280×720 and 1920×1080.
- Both themes, on home, games, the Cuisine map, settings and the Rivals hub.
- Live Rivals and co-op matches at 320, 390, 768, 1280 and 1920.

| Check | Result |
|---|---|
| Horizontal overflow | None, on any screen |
| Rivals ingredient buttons clickable without scrolling | All widths, after the fix |
| Keyboard focus ring | Visible on all of the first 25 tab stops on Games, in both themes |
| Overlapping controls | The flagged pairs are footer links and page content under full-screen games or the settings dialog, which are inert. The mobile lobby action bar is the existing fixed design with clearance |
| Low effects and reduced motion | Pass in the full suite |

Light-mode contrast problems, all from existing platform tokens and present before this branch:

| Token | Contrast | Note |
|---|---|---|
| `ink-faint` on light surfaces | 3.0-3.5 | Below 4.5 |
| `brand-500` links on the page background | 4.0 | Below 4.5 |
| `hot`, `sun`, `mint`, `coral`, `danger` used as text | 1.6-3.0 | On light surfaces |
| White on the pink primary button | 3.1 | Passes only for large or bold text |
| Campaign recipe-book step numbers | 3.6-4.0 | |

Recommendation: keep the dark default for now. First give light mode darker text variants (`brand-600` for links, and darker text forms of `hot`, `sun` and `mint`), then review again. The new screens have no remaining contrast failures in this audit.

**Not tested:** physical phones and tablets, Safari, and screen readers. These are untested, not assumed compatible.

### Railway and compatibility

Read-only evidence from the public GitHub deployments API and the public health endpoint:

- Railway's last successful production deployment is `2aeab76`, created 2026-11-05 19:59:17 UTC and successful at 20:01:05 UTC.
- `https://rt.sinversegames.com/health` reported an uptime that puts the process start at about 20:01:13 UTC. It is served through Railway's edge.

| Combination | Effect |
|---|---|
| New realtime with old web | Safe. Only games and events are added, and existing events and limits are unchanged |
| New web with old realtime | The new modes appear, but `room:create` is refused, because the old schema doesn't list the new game IDs. Release realtime first |
| Protocol change during a match | Both events carry `p: 1`. A mismatch tells the client to refresh, and `matchId` rejects stale matches |
| Server restart | Ends rooms, which live in memory. Nothing is saved for unfinished matches |

### Performance

| Measurement | Result |
|---|---|
| Replay-goal query at its 500-run limit, local database | Median 5.2 ms |
| Summarising those runs | Median 2.2 ms |
| Worker package | 6,346 KiB gzipped. The Workers plan size limit should be confirmed by the owner |
| Linux OpenNext build | 86 s |

Not measured: frame rates on real devices, network traffic per match, and remote database latency.

## Remaining blockers and work

1. Land PR #4's Cloudflare fixes on `main`, then rebase this branch.
2. Provide a non-production realtime service for the Preview.
3. Provide Preview-only secrets and data, then run a hosted Preview and check the full acceptance list on it.
4. Release order: realtime, then web.
5. Physical devices and Safari.
6. Light-mode token fixes before considering light as default.
7. Apply the proposed `AGENTS.md`/`CLAUDE.md` edits at merge: [PROPOSED_AGENT_INSTRUCTION_UPDATES.md](PROPOSED_AGENT_INSTRUCTION_UPDATES.md).

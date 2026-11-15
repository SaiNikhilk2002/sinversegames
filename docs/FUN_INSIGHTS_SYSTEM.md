# Fun Insights and shareable results

Playful, shareable lines about a finished match, and result cards to share them, built **only from what the game recorded**.

**The code:**
- `packages/shared/src/insights.ts` (engine)
- `packages/shared/src/share-card.ts` (card contents)
- `packages/shared/src/identity/share.ts` (signed links)
- `apps/web/src/app/api/share/route.ts`, `apps/web/src/app/share/[token]/` (page and preview image)
- `apps/web/src/components/play/share-result.tsx`, `apps/web/src/components/share/share-card.tsx`

## Principles

- **Facts, not psychology.** Every line is backed by a recorded number: match %, perfect rounds, topics agreed on, the fastest answer or guess, hints, drawings guessed, the winning margin. Nothing claims to measure compatibility, personality, emotions, relationship success or anything else, and no research or statistics are invented. A test scans every generated line for such claims.
- **Rules, not a model.** A rule names the facts it needs and fires only when they hold. There are no AI or LLM calls, and no personal answers or session content leave the server.
- **Deterministic.** The phrasing is picked by a stable hash of the match id, so the results screen and the share card say the same thing, and replaying never changes it.
- **Tone:** positive, humorous or neutral. Disagreements are framed as fun ("Different opinions, great chemistry!").

## Engine

- **`insightsFor(gameId, facts, { players, seed, multiplayer, limit })`** returns the highest-priority rules that hold, at most `limit`.
- **`factsFromResults(results)`** turns a match's recorded `MatchResults` into facts:
  - Same Wavelength: the session aggregates;
  - Doodle Duel: the fastest guess, fewest hints, drawings and drawings guessed (now recorded by the engine; no rule changed);
  - every game: the top score, winning margin and whether both scored.
- **`insightsForResults(results, seed)`** combines the two. Unfinished matches get none.

Rules exist for **specific games** (Same Wavelength, Doodle Duel), for **any multiplayer game**, and for **player counts** (pair or group wording).

**Examples** (each needs the fact shown):

| Line | Needs |
|---|---|
| "Same brain energy: you matched 86% of the time!" | match % ≥ 80 |
| "Everyone gave the same answer 3 times!" | 2+ perfect rounds |
| "You disagree on food but agree on travel. Interesting combination!" | food among split topics (< 30%), travel among agreed (≥ 60%) |
| "Different opinions, great chemistry! Only 12% matched, and that's half the fun." | match % < 30 |
| "You matched on 6 of 8 rounds." | two players |
| "Someone locked in an answer in 2 seconds. Decisive!" | fastest answer < 3 s |
| "A drawing was recognised in just 7 seconds!" | Doodle: fastest guess ≤ 10 s |
| "Someone got it with zero letter hints. Telepathy?" | Doodle: a guess with no hints shown |
| "Only 20 points in it. The rematch is probably necessary." | competitive, margin ≤ 10% of the top score |

**Adding lines:** add a rule to `RULES`, with its facts check and phrasings. If a game needs a new fact, record it in that game's result `details` first, as Doodle Duel now does.

**Where they appear:** on the shared results panel for every completed multiplayer match ("Fun insights"), and on share cards.

## Shareable result cards

1. **Request.** On the results panel, **Share result** posts the match id to `POST /api/share`. "Show our names" is off by default.
2. **Check.** The server checks the session, rate limit (20 a minute) and same origin, then loads the **recorded** match, refusing it if the caller didn't play in it (the same 404 as an unknown id, so ids can't be probed). It must be a completed multiplayer match.
3. **Card contents** (`sharePayloadFor`): the game, a headline ("75% on the same wavelength"), up to four recorded numbers, up to two Fun Insights, the match %, and display names **only if asked**.
4. **Signing.** The card is signed as a 400-day HS256 token (`AUTH_SECRET`, audience `share`). The link is `/share/<token>`.
5. **Display.** `/share/<token>` verifies the signature and renders the card, with a "Play" call to action (Same Wavelength links to the Couples preset).
   - An edited, foreign or expired token is a 404.
   - The page is `noindex`.
   - `/share/<token>/opengraph-image` renders the card as a PNG, both for link previews and for **Save image**.
6. **Delivery.** The browser's native share sheet where available, otherwise copying the link.

**A card never contains** answers, typed text, emails, player ids, room codes or match ids. Tests check the payloads and that tampering is refused.

**What a card proves:** that a server-recorded match produced these numbers. It can't be edited, but anyone holding the link can view it, which is the point.

**Requires a database:** sharing is unavailable without one (503). Insights still show.

## Tests

- **`packages/shared/test/insights.test.ts`:** truthful firing, pair and group wording, determinism and variety, Doodle facts, nothing for unfinished matches, and no relationship or personality claims across many inputs.
- **`packages/shared/test/share.test.ts`:** names only on request, no ids, other games' headlines, tampered, foreign, malformed or oversized tokens refused, and out-of-limit content refused.
- **`apps/web/e2e/same-wavelength.spec.ts`:** a real share link, a card without names, with names on request, a tampered link giving 404, and the play link.

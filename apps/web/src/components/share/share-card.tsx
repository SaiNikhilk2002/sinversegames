import { getGame } from "@platform/shared";
import type { SharePayload } from "@platform/shared/identity";
import { GameArt } from "@/components/brand";
import { GAME_THEME } from "@/components/game-theme";

/**
 * A shareable result card (docs/FUN_INSIGHTS_SYSTEM.md): the game, a headline, recorded numbers
 * and Fun Insights. Rendered from a signed share payload, so it only ever shows what the server
 * put there: never answers, ids or anything private.
 */
export function ShareCard({ data }: { data: SharePayload }) {
  const game = getGame(data.g);
  const theme = GAME_THEME[data.g];
  return (
    <article
      className="relative overflow-hidden rounded-[28px] border border-white/10 p-6 shadow-[0_30px_60px_-30px_rgb(0_0_0/.8)] sm:p-8"
      style={{ background: `linear-gradient(140deg, ${game.theme.from}, ${theme.deep} 55%, ${game.theme.to})`, color: theme.ink }}
      data-testid="share-card"
    >
      <div className="pointer-events-none absolute inset-0 opacity-15" aria-hidden>
        <GameArt gameId={data.g} className="size-full scale-125 blur-xl" />
      </div>
      <div className="relative flex items-center gap-3">
        <div className="w-20 shrink-0 overflow-hidden rounded-xl border border-white/20">
          <GameArt gameId={data.g} className="block aspect-[16/10] w-full" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] uppercase opacity-75">SinverseGames · {game.name}</p>
          {data.n && <p className="truncate text-sm font-semibold">{data.n.join(" & ")}</p>}
        </div>
      </div>
      <div className="relative mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
        {data.m !== undefined && <Dial pct={data.m} accent={theme.accent} />}
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-tight font-semibold sm:text-4xl" data-testid="share-headline">
            {data.h}
          </h1>
          <dl className="mt-3 flex flex-wrap gap-2">
            {data.s.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-black/25 px-3 py-1.5 text-sm">
                <dt className="inline opacity-75">{label}: </dt>
                <dd className="inline font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {data.i.length > 0 && (
        <ul className="relative mt-5 space-y-2" data-testid="share-insights">
          {data.i.map((text) => (
            <li key={text} className="rounded-2xl bg-white/10 px-4 py-2.5 font-semibold">
              {text}
            </li>
          ))}
        </ul>
      )}
      <p className="relative mt-5 text-xs opacity-70">Just for fun: a game result, not a compatibility test.</p>
    </article>
  );
}

function Dial({ pct, accent }: { pct: number; accent: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 110 110" className="size-28 shrink-0" role="img" aria-label={`${pct}%`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="rgb(255 255 255 / .18)" strokeWidth="10" />
      <circle cx="55" cy="55" r={r} fill="none" stroke={accent} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 55 55)" />
      <text x="55" y="62" textAnchor="middle" fontSize="24" fontWeight="800" fill="currentColor">
        {pct}%
      </text>
    </svg>
  );
}

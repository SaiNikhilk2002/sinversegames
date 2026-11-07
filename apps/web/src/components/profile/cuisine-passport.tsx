import Link from "next/link";
import { Compass, Star } from "lucide-react";
import { chefRank, CUISINE_IDS } from "@platform/shared";

interface Row { level: number; stars: number; bestScore: number; completedRuns: number; perfectRuns: number }
interface Run { id: string; score: number; details: unknown; match: { endedAt: Date } }
export function CuisinePassport({ rows, runs, achievementKeys }: { rows: Row[]; runs: Run[]; achievementKeys: string[] }) {
  const completed = rows.filter(row => row.stars > 0).length;
  const mastered = rows.filter(row => row.stars === 3).length;
  const stars = rows.reduce((n,row) => n + row.stars, 0);
  return <section className="mt-9 overflow-hidden rounded-2xl border-2 border-[#96ad88] bg-[#203f38] text-[#f4ebce]" aria-labelledby="cq-passport-heading" data-testid="cq-profile">
    <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-7"><div><p className="flex items-center gap-2 text-xs font-black tracking-widest uppercase text-[#c7d3a3]"><Compass size={17} /> Your chef's passport</p><h2 id="cq-passport-heading" className="mt-2 font-display text-3xl font-black">Cuisine Quest</h2><p className="mt-2 text-sm font-bold text-[#edca80]" data-testid="cq-profile-rank">{chefRank(stars).title}</p><p className="mt-1 text-sm" data-testid="cq-profile-progress">{completed}/7 cuisines · {stars}/21 stars · {mastered} mastered</p><p className="mt-1 text-xs text-[#d0d9b9]">{achievementKeys.filter(key => key.startsWith("cq-")).length} Cuisine Quest achievements · {rows.reduce((n,row) => n+row.perfectRuns,0)} perfect shifts</p></div><Link href="/play/cuisine-quest" className="rounded-xl bg-[#e8bf7a] px-5 py-3 font-bold text-[#234137]">Continue journey</Link></div>
    <ol className="grid grid-cols-2 gap-px bg-[#8a9b7655] sm:grid-cols-4 lg:grid-cols-7">{CUISINE_IDS.map((id,i) => {
      const row = rows.find(row => row.level === i+1); const unlocked = i === 0 || CUISINE_IDS.slice(0,i).every((_,j) => rows.some(row => row.level === j+1 && row.stars > 0));
      return <li key={id} className="bg-[#284c40] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[#cfdbb4]">Kitchen {i+1}</p><h3 className="mt-1 font-display text-lg font-black capitalize">{id}</h3><div className="mt-2 flex gap-1 text-[#edca80]" aria-label={`${row?.stars ?? 0} stars`}>{[1,2,3].map(n => <Star key={n} size={14} fill={(row?.stars ?? 0) >= n ? "currentColor" : "none"} opacity={(row?.stars ?? 0) >= n ? 1 : .4} />)}</div><p className="mt-2 text-[11px]">{row?.stars === 3 ? "Mastered" : row?.stars ? "Completed" : unlocked ? "Ready to explore" : "Locked"}</p><p className="mt-1 text-[10px] text-[#d0d9b9]">Best {row?.bestScore.toLocaleString() ?? "—"}</p></li>;
    })}</ol>
    <div className="p-5"><h3 className="text-sm font-bold">Recent cuisine runs</h3>{runs.length ? <ul className="mt-2 divide-y divide-[#8eab783d]">{runs.map(run => { const details = (run.details ?? {}) as Record<string, number | string>; return <li key={run.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="capitalize">{String(details.cuisine ?? "Kitchen")} · {details.stars ?? 0} stars</span><span>{run.score.toLocaleString()} pts</span><time className="text-[#c8d5b1]">{run.match.endedAt.toLocaleDateString()}</time></li>; })}</ul> : <p className="mt-2 text-xs text-[#cddbb7]">Your first saved shift will start the journey.</p>}</div>
  </section>;
}

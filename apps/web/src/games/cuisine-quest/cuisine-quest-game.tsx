"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Award, BookOpen, ChevronRight, Compass, Lock, Pause, Play, RotateCcw, Star, Volume2, VolumeX } from "lucide-react";
import { chefRank, type CuisineCampaign } from "@platform/shared";
import { applyQuest, advanceQuest, byRecipe, challengesFor, createQuest, CUISINES, currentStep, decodeDishes, evaluateChallenges, MAX_SHIFT_MS, questLogSchema, questResult, STATION_NAMES, TOTAL_SEALS, type CuisineJourney, type Garnish, type QuestAction, type QuestConfig, type QuestIntent, type QuestState } from "@platform/engines/cuisine-quest";
import { Button } from "@/components/ui/primitives";
import { createLoop, playMusic, sfx, stopMusic, unlockAudio } from "@/lib/sound";
import { updateSettings, useSettings } from "@/lib/settings";
import type { SoloGameProps, SoloSetupProps } from "../solo-types";
import { FoodArt, KitchenBackdrop } from "./art";
import { RecipeBook, StationPanel, TicketCard } from "./kitchen-ui";
import { QUEST_SONGS } from "./music";
import { expectJson } from "@/lib/read-json";
import "./cuisine-quest.css";

const Stars = ({ count, label = true }: { count: number; label?: boolean }) => <span className="cq-stars" aria-label={label ? `${count} of 3 stars` : undefined}>{[1,2,3].map(n => <Star key={n} size={18} fill={n <= count ? "currentColor" : "none"} opacity={n <= count ? 1 : .3} />)}</span>;
type CampaignView = CuisineCampaign & { journey?: CuisineJourney | null };
const emptyCampaign: CampaignView = { levels: CUISINES.map(c => ({ level: c.level, cuisine: c.id, unlocked: c.level === 1, stars: 0, bestScore: 0, completedRuns: 0, perfectRuns: 0, mastered: false })), completed: 0, mastered: 0, totalStars: 0 };

export function CuisineQuestSetup({ onStart, busy }: SoloSetupProps) {
  const [campaign, setCampaign] = useState(emptyCampaign); const [level, setLevel] = useState(1);
  const [loading, setLoading] = useState(true); const [loaded, setLoaded] = useState(false); const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<{ name: string; score: number; stars: number }[] | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/cuisine-quest/campaign", { cache: "no-store", signal: AbortSignal.timeout(8000) });
      const data = await expectJson<typeof emptyCampaign & { available?: boolean; error?: string }>(response, "Campaign saving is unavailable.");
      if (!data.available) throw new Error(data.error ?? "Campaign saving is unavailable.");
      setCampaign(data); setLoaded(true); setLevel(Math.min(7, data.completed + 1));
    } catch (e) { setError(e instanceof Error ? e.message : "Campaign couldn't be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const controller = new AbortController(); setBoard(null);
    fetch(`/api/cuisine-quest/leaderboard?level=${level}`, { cache: "no-store", signal: controller.signal }).then(r => r.json()).then(data => { if (!controller.signal.aborted) setBoard(data.available ? data.entries : null); }).catch(() => {});
    const timeout = setTimeout(() => controller.abort(), 8000); return () => { clearTimeout(timeout); controller.abort(); };
  }, [level]);
  const cuisine = CUISINES[level - 1]!; const progress = campaign.levels[level - 1]!;
  const rank = chefRank(campaign.totalStars); const journey = campaign.journey; const earned = journey?.seals[level] ?? [];
  return <section className="cq-map" data-testid="cq-campaign" aria-label="Cuisine Quest campaign">
    <div className="cq-map-heading"><div><p className="cq-eyebrow">A passport to good food</p><h2>Seven kitchens.<br />Your signature.</h2>{loaded && <p className="cq-rank" data-testid="cq-chef-rank"><strong>{rank.title}</strong><span>{rank.next ? `${rank.next.starsNeeded} more star${rank.next.starsNeeded > 1 ? "s" : ""} to ${rank.next.title}` : "The highest rank in the world"}{journey ? ` · ${journey.sealCount}/${TOTAL_SEALS} chef's seals` : ""}</span></p>}</div><div className="cq-passport"><Compass size={28} /><strong data-testid="cq-total-stars">{loaded ? campaign.totalStars : "—"} / 21</strong><span>{loaded ? `${campaign.completed}/7 cuisines · ${campaign.mastered} mastered` : error ? "Progress not loaded" : "Loading your passport"}</span></div></div>
    {loading && <p role="status">Opening your chef's passport…</p>}
    {error && <p className="cq-map-error" role="alert">{error} <button onClick={() => void load()}>Retry campaign</button></p>}
    <div className="cq-route" role="radiogroup" aria-label="Cuisine journey">{CUISINES.map(c => {
      const p = campaign.levels[c.level - 1]!;
      return <button key={c.level} type="button" role="radio" aria-checked={level === c.level} disabled={!p.unlocked || busy || loading} data-testid={`cq-level-${c.level}`} className={`cq-stop ${level === c.level ? "cq-stop-selected" : ""}`} style={{ "--cq-accent": c.color } as React.CSSProperties} onClick={() => { unlockAudio(); sfx.pickup(); setLevel(c.level); }}>
        <span className="cq-stop-number">{p.unlocked ? String(c.level).padStart(2, "0") : <Lock size={18} aria-label="Locked" />}</span><span>{c.name.replace(" Kitchen", "").replace(" Trattoria", "")}</span><Stars count={p.stars} />{p.mastered && <small>MASTERED</small>}
      </button>;
    })}</div>
    <div className="cq-destination" style={{ "--cq-accent": cuisine.color, "--cq-dark": cuisine.dark } as React.CSSProperties}>
      <div className="cq-destination-scene"><KitchenBackdrop level={level} /><span className="cq-postmark">KITCHEN {String(level).padStart(2, "0")}<br />{cuisine.id.toUpperCase()}</span><div className="cq-destination-food"><FoodArt recipe={cuisine.recipes[0]!} /></div></div>
      <div className="cq-destination-copy"><p className="cq-eyebrow">{cuisine.place}</p><h3>{cuisine.name}</h3><p>{cuisine.lesson}</p><p className="cq-challenge">Final service: {cuisine.challenge}</p><div className="cq-menu-preview">{cuisine.recipes.map(id => <div key={id} data-testid={`cq-recipe-${id}`}><FoodArt recipe={id} /><span>{byRecipe.get(id)!.name}</span>{journey?.recipes[id] && <small className={`cq-mastery cq-mastery-${journey.recipes[id].tier}`} title={`${journey.recipes[id].plates} plates, best ${journey.recipes[id].best}%`}>{journey.recipes[id].tier}</small>}</div>)}</div>{loaded && journey && <ul className="cq-challenges" aria-label="Chef's challenges" data-testid="cq-challenges">{challengesFor(level).map(challenge => { const done = earned.includes(challenge.id); return <li key={challenge.id} className={done ? "cq-seal-done" : ""} data-seal={challenge.id} data-done={done}><Award size={18} aria-hidden /><div><strong>{challenge.title}</strong><small>{challenge.description}</small></div><span className="sr-only">{done ? "Earned" : "Not earned yet"}</span></li>; })}</ul>}<div className="cq-destination-bottom"><div><Stars count={progress.stars} /><small>{progress.bestScore ? `Best ${progress.bestScore.toLocaleString()} · ${progress.completedRuns} completed` : "A fresh page in your passport"}</small></div><button type="button" className="cq-primary" disabled={busy || loading || !progress.unlocked} data-testid="start-run" onClick={() => { unlockAudio(); onStart({ level }); }}>{busy ? "Opening…" : progress.completedRuns ? "Revisit kitchen" : "Enter kitchen"}<ChevronRight size={20} /></button></div></div>
    </div>
    <div className="cq-map-foot"><p>One saved star opens the next kitchen. Replay freely to improve your craft. First cuisine completions earn Sin Coins; new records and achievements can earn bonuses within the daily cap.</p><div><h3>{cuisine.name} · best plates</h3>{board?.length ? <ol>{board.slice(0,3).map((row, i) => <li key={i}><span>{i+1}. {row.name}</span><strong>{row.score.toLocaleString()}</strong></li>)}</ol> : <p>{board ? "No saved plates yet. Set the first record." : "Cuisine rankings are unavailable right now."}</p>}</div></div>
  </section>;
}

function restore(seed: number, config: QuestConfig, initialLog: unknown) {
  const state = createQuest(seed, config); const log: QuestAction[] = [];
  if (initialLog !== undefined) {
    const parsed = questLogSchema.safeParse(initialLog);
    if (!parsed.success && Array.isArray(initialLog) && !initialLog.length) return { state, log, error: null };
    if (!parsed.success) return { state, log, error: "This recovery log is damaged. Return to the campaign and start a fresh shift." };
    for (const action of parsed.data) { if (!applyQuest(state, action).ok) return { state: createQuest(seed, config), log: [], error: "This recovery log couldn't be replayed. Start a fresh shift." }; log.push(action); }
  }
  return { state, log, error: null };
}
const fmtTime = (ms: number) => `${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,"0")}`;

export function CuisineQuestGame({ seed, config, onFinish, onQuit, initialLog, onCheckpoint }: SoloGameProps<QuestConfig>) {
  const [session] = useState(() => restore(seed, config, initialLog)); const s = session.state;
  const log = useRef(session.log); const callbacks = useRef({ onFinish, onCheckpoint }); callbacks.current = { onFinish, onCheckpoint };
  const [, repaint] = useState(0); const [paused, setPaused] = useState(true); const [intro, setIntro] = useState(!session.log.length); const [introPage, setIntroPage] = useState(0);
  const [selected, setSelected] = useState(0); const [portions, setPortions] = useState(1); const [garnish, setGarnish] = useState<Garnish>(CUISINES[config.level-1]!.garnish);
  const [book, setBook] = useState(false); const [error, setError] = useState<string | null>(session.error);
  const overlay = useRef<HTMLDivElement>(null);
  const clock = useRef({ real: 0, logical: s.t }); const ended = useRef(false); const lastSave = useRef(s.t); const seenEvent = useRef(s.event);
  const settings = useSettings(); const cuisine = CUISINES[config.level - 1]!;
  const waiting = s.orders.filter(o => o.status === "waiting");
  const o = s.orders[selected]!; const step = currentStep(o);
  useEffect(() => { if (paused) overlay.current?.querySelector<HTMLButtonElement>(".cq-primary")?.focus(); }, [paused, book, introPage]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const footers = [...document.querySelectorAll<HTMLElement>("body footer")].filter(el => !el.closest(".cq-game"));
    const prior = footers.map(el => el.inert);
    document.body.style.overflow = "hidden";
    footers.forEach(el => { el.inert = true; });
    return () => {
      document.body.style.overflow = previousOverflow;
      footers.forEach((el, i) => { el.inert = prior[i]!; });
    };
  }, []);
  const logicalNow = () => Math.min(MAX_SHIFT_MS, Math.max(s.t, clock.current.logical + Math.floor(performance.now() - clock.current.real)));
  const finishIfNeeded = useCallback(() => {
    if (!s.finished || ended.current) return;
    ended.current = true;
    const finish: QuestAction = { kind: "finish", t: s.t }; if (!applyQuest(s, finish).ok) return;
    log.current.push(finish);
    const result = questResult(s);
    callbacks.current.onFinish(log.current, { score: result.score, completed: result.completed, headline: result.completed ? `${cuisine.name} complete` : "A little more practice", ...(result.completed && config.level < 7 ? { nextConfig: { level: config.level + 1 }, nextLabel: `Next: ${CUISINES[config.level]!.name}` } : {}) });
  }, [s, config.level, cuisine.name]);
  const feedbackSound = useCallback(() => {
    if (seenEvent.current === s.event) return; seenEvent.current = s.event;
    if (s.lastEvent === "serve") sfx.serve(); else if (s.lastEvent === "flip") sfx.flip(); else if (s.lastEvent === "chop" || s.lastEvent === "slice" || s.lastEvent === "crush") sfx.chop(); else if (s.lastEvent === "burnt" || s.lastEvent === "mistake" || s.lastEvent === "left") sfx.error(); else if (s.lastEvent === "arrive") sfx.doorChime(); else if (s.lastEvent === "plate") sfx.plateClink(); else if (s.lastEvent === "stir" || s.lastEvent === "mix") sfx.splash(); else sfx.pickup();
  }, [s]);
  const send = useCallback((intent: QuestIntent) => {
    if (paused || ended.current || session.error) return false;
    const action = { ...intent, t: logicalNow() } as QuestAction;
    const result = applyQuest(s, action);
    if (result.ok) { log.current.push(action); setError(null); callbacks.current.onCheckpoint?.(log.current); }
    else setError(result.error ?? "Try that step again.");
    feedbackSound(); repaint(n => n + 1); finishIfNeeded(); return result.ok;
  }, [paused, s, session.error, feedbackSound, finishIfNeeded]);

  useEffect(() => {
    if (paused || session.error) return;
    clock.current = { real: performance.now(), logical: s.t };
    const tick = setInterval(() => {
      advanceQuest(s, logicalNow());
      if (!s.finished && s.t - lastSave.current >= 1000) {
        log.current.push({ kind: "wait", t: s.t }); lastSave.current = s.t; callbacks.current.onCheckpoint?.(log.current);
      }
      feedbackSound(); repaint(n => n+1); finishIfNeeded();
    }, 100);
    return () => clearInterval(tick);
  }, [paused, s, session.error, feedbackSound, finishIfNeeded]);
  useEffect(() => { if (waiting.length && o.status !== "waiting") { setSelected(waiting[0]!.id); setPortions(1); setGarnish(cuisine.garnish); } }, [waiting.map(x => x.id).join(","), o.status, cuisine.garnish]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { setPaused(true); callbacks.current.onCheckpoint?.(log.current); } };
    document.addEventListener("visibilitychange", hide); return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    if (paused) return;
    playMusic(QUEST_SONGS[config.level - 1]!); const room = createLoop("room"); room.set(.65);
    const sizzle = createLoop("sizzle"), fry = createLoop("fry"), simmer = createLoop("simmer");
    const update = () => {
      const cooking = s.orders.map(currentStep).map((step, i) => s.orders[i]!.status === "waiting" && s.orders[i]!.startedAt !== null && step?.kind === "cook" ? step.method : null);
      sizzle.set(cooking.some(m => m === "tawa" || m === "grill" || m === "wok" || m === "temper") ? .55 : 0);
      fry.set(cooking.includes("fry") ? .6 : 0); simmer.set(cooking.some(m => m === "boil" || m === "steam") ? .6 : 0);
    };
    update(); const timer = setInterval(update, 400);
    return () => { clearInterval(timer); stopMusic(); room.stop(); sizzle.stop(); fry.stop(); simmer.stop(); };
  }, [paused, config.level, s]);

  const select = (id: number) => { setSelected(id); setPortions(1); setGarnish(cuisine.garnish); setError(null); sfx.pickup(); };
  const relevant = [...new Set(cuisine.recipes.flatMap(id => byRecipe.get(id)!.steps.map(step => step.station))), "serving"];
  return <section className="cq-game" data-testid="cuisine-quest" data-level={config.level} data-time={s.t} data-paused={paused} style={{ "--cq-accent": cuisine.color, "--cq-dark": cuisine.dark, "--cq-wall": cuisine.wall } as React.CSSProperties}>
    <KitchenBackdrop level={config.level} className="cq-kitchen-backdrop" />
    <header className="cq-game-top"><div><span className="cq-eyebrow">KITCHEN {String(config.level).padStart(2,"0")} / 07</span><h2>{cuisine.name}</h2></div><div className="cq-clock" aria-label="Active play time">{fmtTime(s.t)}<small>{s.served} / 7 plates</small></div><button aria-label={settings.sound ? "Mute game" : "Unmute game"} onClick={() => { unlockAudio(); updateSettings({ sound: !settings.sound }); }}>{settings.sound ? <Volume2 size={20} /> : <VolumeX size={20} />}</button><button aria-label="Pause kitchen" onClick={() => setPaused(true)}><Pause size={20} /></button></header>
    <div className="cq-tickets" aria-label="Customer orders">{s.orders.filter(order => order.status !== "queued").map(order => <TicketCard key={order.id} order={order} s={s} selected={selected} seed={seed} garnish={garnish} select={select} send={send} />)}{s.orders.slice(4).every(order => order.status === "queued") && <span className="cq-rush-note">Finish the first four tickets<br />to open the final service rush.</span>}</div>
    <div className="cq-workspace">
      <aside className="cq-book-desktop"><RecipeBook order={o} /></aside>
      <StationPanel s={s} selected={selected} showPortions={config.level >= 5} portions={portions} setPortions={setPortions} garnish={garnish} setGarnish={setGarnish} send={send} />
      <aside className="cq-station-shelf"><p className="cq-eyebrow">Your kitchen</p>{relevant.map(station => <div key={station} className={step?.station === station || !step && station === "serving" ? "cq-shelf-active" : ""}><span>{STATION_NAMES[station as keyof typeof STATION_NAMES]}</span><small>{s.orders.some(order => order.status === "waiting" && order.startedAt !== null && currentStep(order)?.station === station) ? "In use" : "Ready"}</small></div>)}<p>{cuisine.challenge}</p></aside>
    </div>
    <div className={`cq-feedback ${error || s.feedbackKind === "error" ? "cq-feedback-error" : ""}`} role="status" aria-live="polite">{error ?? s.feedback}</div>
    <footer className="cq-game-bottom"><button className="cq-action" onClick={() => { setBook(true); setPaused(true); }}><BookOpen size={17} />Recipe book</button><span>{s.orders.filter(order => order.batchActive).length}/2 batches · {s.perfect} perfect</span><button className="cq-action" disabled={!o.batchActive || paused} onClick={() => send({ kind: "restart", order: selected })}><RotateCcw size={17} /><span>Restart batch</span></button></footer>
    {paused && <div ref={overlay} className="cq-pause" role="dialog" aria-modal="true" aria-label={book ? "Recipe book" : intro ? "Kitchen introduction" : "Kitchen paused"} onKeyDown={event => {
      if (event.key === "Escape" && !intro && !session.error) { setBook(false); setPaused(false); }
      if (event.key !== "Tab") return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className={`cq-pause-paper ${book ? "cq-open-book" : ""}`}>
        {book ? <><RecipeBook order={o} /><button className="cq-primary" onClick={() => { setBook(false); unlockAudio(); setPaused(false); }}>Back to cooking</button></> : <><span className="cq-eyebrow">{intro ? `PASSPORT STAMP ${String(config.level).padStart(2,"0")}` : session.log.length ? "Your kitchen is safely paused" : "Take a breath, chef"}</span><h2>{cuisine.name}</h2><FoodArt recipe={cuisine.recipes[introPage % 4]!} className="cq-intro-dish" />{session.error ? <p role="alert">{session.error}</p> : intro ? <><h3>{["Meet your kitchen", "Cook with your hands", "Make every guest feel welcome"][introPage]}</h3><p>{[cuisine.lesson, "Choose ingredients in recipe order. Tap or drag through numbered preparation markers; Space and the labelled buttons perform the same actions. Set recipe heat before cooking, then watch the flip, stir and lift cues.", "Read each ticket's finish and patience meter. You can keep two batches active. Six guests request seven plates; the final two arrive as a service rush. Pause whenever you need."][introPage]}</p></> : <p>{session.log.length ? "Your exact preparation and orders were restored. Timers stay frozen until you resume." : "Cooking, customer patience and music are paused. Resume when you're ready."}</p>}
          {!session.error && <button className="cq-primary" data-testid={intro ? "cq-tutorial-next" : "cq-resume"} onClick={() => { unlockAudio(); if (intro && introPage < 2) setIntroPage(n => n+1); else { setIntro(false); setPaused(false); } }}>{intro && introPage < 2 ? "Next" : intro ? "Begin service" : "Resume shift"}<Play size={18} /></button>}
          <button className="cq-text-button" onClick={() => { callbacks.current.onCheckpoint?.(log.current); onQuit(); }}>Save and return to campaign</button>
        </>}
      </div>
    </div>}
  </section>;
}

/** Why this run scored what it did. Runs saved before these details existed simply omit it. */
function ScoreStory({ details }: { details: Record<string, number | string> }) {
  const level = Number(details.level);
  const parts = [["Plates served", details.serviceScore, 4500], ["Cooking craft", details.craftScore, 3000], ["Guest welcome", details.welcomeScore, 1500], ["Clean technique", details.accuracyScore, 1000]] as const;
  const dishes = decodeDishes(details.dishes);
  return <>
    {details.serviceScore !== undefined && <ul className="cq-score-story" data-testid="cq-score-breakdown" aria-label="Score breakdown">{parts.map(([label, value, max]) => <li key={label}><span>{label}</span><strong>{Number(value).toLocaleString()}<small> / {max.toLocaleString()}</small></strong><i aria-hidden><b style={{ width: `${Math.min(100, Number(value) / max * 100)}%` }} /></i></li>)}</ul>}
    {dishes.length > 0 && <ul className="cq-plate-list" data-testid="cq-plate-list" aria-label="Plate quality">{dishes.map((dish, i) => <li key={i} className={dish.quality >= 95 ? "cq-plate-perfect" : ""}><span>{byRecipe.get(dish.recipe)!.name}</span><strong>{dish.quality}%</strong></li>)}</ul>}
    <ul className="cq-run-seals" data-testid="cq-run-seals" aria-label="Chef's challenges this shift">{evaluateChallenges(level, details).map(challenge => <li key={challenge.id} className={challenge.done ? "cq-seal-done" : ""} data-seal={challenge.id} data-done={challenge.done}><Award size={16} aria-hidden /><div><strong>{challenge.title}</strong><small>{challenge.done ? "Earned this shift" : challenge.description}</small></div></li>)}</ul>
  </>;
}

export function CuisineQuestResultDetails({ details, saved }: { details: Record<string, number | string>; saved: boolean }) {
  const stars = Number(details.stars ?? 0);
  return <div className="cq-result-detail" data-testid="cq-verified-details"><div className="cq-result-stars"><Stars count={stars} /><strong>{stars}/3 stars</strong></div><div className="cq-result-grid">{[["Orders / plates", `${details.served}/${details.wanted}`],["Perfect dishes", details.perfect],["Mistakes", details.mistakes],["Burnt batches", details.burnt],["Cooking precision", `${details.precision}%`],["Customer satisfaction", `${details.satisfaction}%`]].map(([label,value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div><ScoreStory details={details} /><p>{saved ? `Passport saved · ${details.cuisinesCompleted}/7 cuisines · ${details.totalStars}/21 stars` : "Verified result. Your passport still needs to be saved before the next kitchen opens."}</p></div>;
}

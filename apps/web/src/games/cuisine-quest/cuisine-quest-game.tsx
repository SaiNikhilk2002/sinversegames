"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ChevronRight, Compass, Lock, Pause, Play, RotateCcw, Star, Volume2, VolumeX, X } from "lucide-react";
import type { CuisineCampaign } from "@platform/shared";
import { applyQuest, advanceQuest, byRecipe, cookForm, createQuest, CUISINES, currentRecipe, currentStep, GESTURE_GAP_MS, MAX_SHIFT_MS, PATHS, questHint, questLogSchema, questResult, STATION_NAMES, type Garnish, type Order, type QuestAction, type QuestConfig, type QuestIntent, type QuestState } from "@platform/engines/cuisine-quest";
import { Button } from "@/components/ui/primitives";
import { createLoop, playMusic, sfx, stopMusic, unlockAudio } from "@/lib/sound";
import { updateSettings, useSettings } from "@/lib/settings";
import type { SoloGameProps, SoloSetupProps } from "../solo-types";
import { CustomerPortrait, FoodArt, IngredientArt, KitchenBackdrop, PreparationArt } from "./art";
import { QUEST_SONGS } from "./music";
import { expectJson } from "@/lib/read-json";
import "./cuisine-quest.css";

const Stars = ({ count, label = true }: { count: number; label?: boolean }) => <span className="cq-stars" aria-label={label ? `${count} of 3 stars` : undefined}>{[1,2,3].map(n => <Star key={n} size={18} fill={n <= count ? "currentColor" : "none"} opacity={n <= count ? 1 : .3} />)}</span>;
const emptyCampaign: CuisineCampaign = { levels: CUISINES.map(c => ({ level: c.level, cuisine: c.id, unlocked: c.level === 1, stars: 0, bestScore: 0, completedRuns: 0, perfectRuns: 0, mastered: false })), completed: 0, mastered: 0, totalStars: 0 };

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
  return <section className="cq-map" data-testid="cq-campaign" aria-label="Cuisine Quest campaign">
    <div className="cq-map-heading"><div><p className="cq-eyebrow">A passport to good food</p><h2>Seven kitchens.<br />Your signature.</h2></div><div className="cq-passport"><Compass size={28} /><strong data-testid="cq-total-stars">{loaded ? campaign.totalStars : "—"} / 21</strong><span>{loaded ? `${campaign.completed}/7 cuisines · ${campaign.mastered} mastered` : error ? "Progress not loaded" : "Loading your passport"}</span></div></div>
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
      <div className="cq-destination-copy"><p className="cq-eyebrow">{cuisine.place}</p><h3>{cuisine.name}</h3><p>{cuisine.lesson}</p><p className="cq-challenge">Final service: {cuisine.challenge}</p><div className="cq-menu-preview">{cuisine.recipes.map(id => <div key={id}><FoodArt recipe={id} /><span>{byRecipe.get(id)!.name}</span></div>)}</div><div className="cq-destination-bottom"><div><Stars count={progress.stars} /><small>{progress.bestScore ? `Best ${progress.bestScore.toLocaleString()} · ${progress.completedRuns} completed` : "A fresh page in your passport"}</small></div><button type="button" className="cq-primary" disabled={busy || loading || !progress.unlocked} data-testid="start-run" onClick={() => { unlockAudio(); onStart({ level }); }}>{busy ? "Opening…" : progress.completedRuns ? "Revisit kitchen" : "Enter kitchen"}<ChevronRight size={20} /></button></div></div>
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
  const o = s.orders[selected]!; const step = currentStep(o); const recipe = currentRecipe(o);
  const hint = questHint(s, selected);
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
  const actualStage = !step ? "perfect" : step.kind === "cook" && o.startedAt !== null ? cookForm(o) : o.step > 3 ? "prepared" : "raw";
  const relevant = [...new Set(cuisine.recipes.flatMap(id => byRecipe.get(id)!.steps.map(step => step.station))), "serving"];
  return <section className="cq-game" data-testid="cuisine-quest" data-level={config.level} data-time={s.t} data-paused={paused} style={{ "--cq-accent": cuisine.color, "--cq-dark": cuisine.dark, "--cq-wall": cuisine.wall } as React.CSSProperties}>
    <KitchenBackdrop level={config.level} className="cq-kitchen-backdrop" />
    <header className="cq-game-top"><div><span className="cq-eyebrow">KITCHEN {String(config.level).padStart(2,"0")} / 07</span><h2>{cuisine.name}</h2></div><div className="cq-clock" aria-label="Active play time">{fmtTime(s.t)}<small>{s.served} / 7 plates</small></div><button aria-label={settings.sound ? "Mute game" : "Unmute game"} onClick={() => { unlockAudio(); updateSettings({ sound: !settings.sound }); }}>{settings.sound ? <Volume2 size={20} /> : <VolumeX size={20} />}</button><button aria-label="Pause kitchen" onClick={() => setPaused(true)}><Pause size={20} /></button></header>
    <div className="cq-tickets" aria-label="Customer orders">{s.orders.filter(order => order.status !== "queued").map(order => {
      const remaining = order.status === "waiting" ? Math.max(0, 1 - (s.t - order.arrivedAt!) / order.patienceMs) : 0;
      const mood = order.status === "served" ? "celebrating" : order.status === "left" ? "angry" : order.id === selected && s.feedbackKind === "error" ? "impatient" : remaining < .25 ? "impatient" : order.type === "patient" ? "happy" : "hungry";
      return <button type="button" key={order.id} className={`cq-ticket ${selected === order.id ? "cq-ticket-selected" : ""} ${order.status === "served" ? "cq-ticket-served" : ""}`} data-testid={`cq-ticket-${order.id}`} data-order={order.id} data-status={order.status} disabled={order.status !== "waiting"} onClick={() => select(order.id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const from = e.dataTransfer.getData("text/cq-plate"); if (from !== "") send({ kind: "serve", order: Number(from), recipient: order.id, garnish }); }} aria-label={`Ticket ${order.id+1}: ${currentRecipe(order).name}, ${order.garnish} finish, ${order.type} guest`}>
        <CustomerPortrait seed={seed + order.id} mood={mood} color={["#7b6f98","#b16c59","#689182","#b19d62","#688c9d","#94785e"][order.id]!} /><div><span className="cq-ticket-name">{currentRecipe(order).name}</span><small>{order.type === "large" ? `${order.delivered}/2 plates` : order.type} · {order.garnish}</small><span className="cq-patience" role="meter" aria-label={`Ticket ${order.id+1} patience`} aria-valuenow={Math.round(remaining*100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${remaining*100}%`, background: remaining < .25 ? "#ed8b6a" : "#bdd08a" }} /></span>{order.status !== "waiting" && <small>{order.status === "served" ? "Thank you, chef!" : "Guest left"}</small>}</div>
      </button>;
    })}{s.orders.slice(4).every(order => order.status === "queued") && <span className="cq-rush-note">Finish the first four tickets<br />to open the final service rush.</span>}</div>
    <div className="cq-workspace">
      <aside className="cq-book-desktop"><RecipeBook order={o} /></aside>
      <div className="cq-station" data-testid="cq-station">
        <div className="cq-station-caption"><span>{!step ? "Serving counter" : STATION_NAMES[step.station]}</span><small>Ticket {selected+1} · {o.delivered+1}/{o.wanted}</small></div>
        {o.status !== "waiting" ? <div className="cq-waiting"><Compass size={40} /><h3>Service continues</h3><p>Take a breath. The next guest is on the way.</p></div> : <>
          <div className="cq-current-recipe"><h3>{recipe.name}</h3><span>{Math.min(o.step+1, recipe.steps.length)} / {recipe.steps.length}</span></div>
          {step?.kind === "ingredient" ? <div className="cq-pantry">
            <div className="cq-pantry-cue"><IngredientArt id={step.ingredient} /><p>{step.label}<strong>{step.portions} portion{step.portions > 1 ? "s" : ""}</strong></p></div>
            {config.level >= 5 && <div className="cq-portions" role="group" aria-label="Ingredient portions">{[1,2,3].map(n => <button key={n} aria-pressed={portions === n} onClick={() => setPortions(n)}>{n} portion{n > 1 ? "s" : ""}</button>)}</div>}
            <div className="cq-ingredients">{[...new Set([...recipe.steps.filter(x => x.kind === "ingredient").map(x => x.ingredient), "water", "spice"])].slice(0,6).map(id => <button type="button" key={id} data-ingredient={id} data-testid={`cq-ingredient-${id}`} draggable onDragStart={e => e.dataTransfer.setData("text/cq-ingredient", id)} onClick={() => send({ kind: "ingredient", order: selected, ingredient: id, portions })}><IngredientArt id={id} /><span>{id.replaceAll("-", " ")}</span></button>)}</div>
            <div className="cq-drop-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const ingredient = e.dataTransfer.getData("text/cq-ingredient"); if (ingredient) send({ kind: "ingredient", order: selected, ingredient, portions }); }}>Tap an ingredient, or drag it here.</div>
          </div> : step?.kind === "technique" ? <div className="cq-preparation">
            {o.startedAt === null ? <><FoodArt recipe={o.recipe} stage={step.technique === "plate" ? "perfect" : "prepared"} className="cq-dish-preview" /><p>{step.label}</p><button className="cq-primary" data-testid="cq-begin" onClick={() => send({ kind: "begin", order: selected })}>Start {STATION_NAMES[step.station].toLowerCase()}</button></> : <><TechniquePad order={o} send={send} /><button className="cq-action cq-keyboard-step" data-testid="cq-follow-marker" onClick={() => { const point = PATHS[step.technique][o.node]!; send({ kind: "gesture", order: selected, node: o.node, x: point[0], y: point[1] }); }}>Follow marker {o.node+1}<small>Keyboard / tap alternative</small></button></>}
          </div> : step?.kind === "cook" ? <div className="cq-cooking">
            <div className={`cq-cooker cq-${step.method} ${o.flipped ? "cq-flipped" : ""}`}><div className="cq-cookware" /><FoodArt recipe={o.recipe} progress={Math.floor(o.work/(step.ms*10)*4)/4} stage={actualStage === "unprepared" ? "raw" : actualStage as "prepared" | "cooking" | "perfect" | "overcooked" | "burnt"} /><span className={`cq-food-state cq-state-${cookForm(o)}`}>{o.startedAt === null ? "Ready to cook" : cookForm(o)}</span></div>
            <div className="cq-heat" role="group" aria-label="Cooking heat"><span>Heat · recipe {step.heat}</span>{[1,2,3,4,5].map(n => <button type="button" key={n} aria-label={`Heat ${n}`} aria-pressed={o.heat === n} onClick={() => send({ kind: "heat", order: selected, value: n })}>{n}</button>)}</div>
            {o.startedAt === null ? <button className="cq-primary" data-testid="cq-begin" onClick={() => send({ kind: "begin", order: selected })}>Start {step.method}</button> : <><div className="cq-cooking-window" style={{ gridTemplateColumns: `${step.ms}fr 2000fr 3000fr` }} role="progressbar" aria-label="Cooking progress" aria-valuenow={Math.min(100, Math.round(o.work/(step.ms*10)*100))} aria-valuemin={0} aria-valuemax={100}><span>COOKING</span><span>PERFECT</span><span>OVERDONE</span><i style={{ left: `${Math.min(98, o.work/((step.ms+5000)*10)*100)}%` }} /></div><div className="cq-cook-actions">{step.flip && <button className="cq-action" data-testid="cq-flip" disabled={o.flipped} onClick={() => send({ kind: "flip", order: selected })}>{o.flipped ? "Flipped" : "Flip"}</button>}{step.stirs > 0 && <button className="cq-action" data-testid="cq-stir" disabled={o.stirs >= step.stirs} onClick={() => send({ kind: "stir", order: selected })}>Stir / toss {o.stirs}/{step.stirs}</button>}<button className="cq-primary" data-testid="cq-lift" disabled={o.work < step.ms*10} onClick={() => send({ kind: "lift", order: selected })}>Lift from {step.method === "bake" ? "oven" : "heat"}</button></div></>}
          </div> : <div className="cq-ready-plate"><FoodArt recipe={o.recipe} /><p>Guest's finish: <strong>{o.garnish}</strong></p><div className="cq-garnishes" role="group" aria-label="Plate finish">{(["herbs","lemon","sesame"] as Garnish[]).map(g => <button className="cq-action" key={g} aria-pressed={garnish === g} aria-label={`Finish: ${g}`} onClick={() => setGarnish(g)}>{g}</button>)}</div><button className="cq-primary" data-testid="cq-serve" draggable onDragStart={e => e.dataTransfer.setData("text/cq-plate", String(selected))} onClick={() => send({ kind: "serve", order: selected, garnish })}>Serve plate · ticket {selected+1}</button></div>}
        </>}
        <div className="cq-guide" data-testid="cq-guide" data-next-action={hint.action?.kind ?? "wait"} data-next-ingredient={hint.action?.kind === "ingredient" ? hint.action.ingredient : undefined} data-next-portions={hint.action?.kind === "ingredient" ? hint.action.portions : undefined} data-next-heat={hint.action?.kind === "heat" ? hint.action.value : undefined} data-next-node={hint.action?.kind === "gesture" ? hint.action.node : undefined} data-next-garnish={hint.action?.kind === "serve" ? hint.action.garnish : undefined}><BookOpen size={16} /><span>{hint.text}</span></div>
      </div>
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

function RecipeBook({ order }: { order: Order }) {
  const recipe = currentRecipe(order);
  return <div className="cq-recipe-book"><p className="cq-eyebrow">Chef's field notes</p><h3>{recipe.name}</h3><p>{recipe.description}</p><p className="cq-guest-note">Ticket {order.id+1} · {order.wanted} plate{order.wanted > 1 ? "s" : ""} · {order.garnish} finish</p><ol>{recipe.steps.map((step, i) => <li key={i} className={i === order.step ? "cq-step-current" : i < order.step ? "cq-step-done" : ""}><span>{i < order.step ? "✓" : String(i+1).padStart(2,"0")}</span><div>{step.label}{step.kind === "ingredient" && <small>{step.portions} portion{step.portions > 1 ? "s" : ""}</small>}{step.kind === "cook" && <small>{step.ms/1000}s at heat {step.heat}{step.flip ? " · flip at halfway" : ""}{step.stirs ? ` · ${step.stirs} timed stir${step.stirs > 1 ? "s" : ""}` : ""}</small>}</div></li>)}</ol></div>;
}
function TechniquePad({ order, send }: { order: Order; send: (intent: QuestIntent) => boolean }) {
  const pad = useRef<HTMLDivElement>(null); const dragging = useRef<number | null>(null); const last = useRef(-1000);
  const step = currentStep(order); if (step?.kind !== "technique") return null;
  const path = PATHS[step.technique];
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (performance.now() - last.current < GESTURE_GAP_MS) return;
    const rect = e.currentTarget.getBoundingClientRect(); const x = Math.round((e.clientX-rect.x)/rect.width*1000), y = Math.round((e.clientY-rect.y)/rect.height*1000);
    const p = path[order.node]; if (!p || Math.hypot(x-p[0], y-p[1]) > 155) return;
    last.current = performance.now(); send({ kind: "gesture", order: order.id, node: order.node, x: Math.max(0,Math.min(1000,x)), y: Math.max(0,Math.min(1000,y)) });
  };
  return <div className={`cq-pad cq-technique-${step.technique}`} ref={pad} role="group" aria-label={`${step.technique} preparation area`} tabIndex={0} onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); const p = path[order.node]; if (p) send({ kind: "gesture", order: order.id, node: order.node, x: p[0], y: p[1] }); } }} onPointerDown={e => { e.preventDefault(); dragging.current = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} move(e); }} onPointerMove={e => { if (dragging.current === e.pointerId) move(e); }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onLostPointerCapture={() => { dragging.current = null; }}>
    <PreparationArt recipe={order.recipe} ingredient={currentRecipe(order).steps.find(s=>s.kind==="ingredient")?.ingredient ?? "flour"} technique={step.technique} progress={order.node/path.length} /><svg className="cq-path" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden><polyline points={path.map(p => p.join(",")).join(" ")} fill="none" stroke="rgb(255 247 214 / .55)" strokeDasharray="15 18" strokeWidth="8" /></svg>{path.map((point, i) => <span key={i} className={`cq-marker ${i === order.node ? "cq-marker-active" : i < order.node ? "cq-marker-done" : ""}`} data-active={i === order.node} data-x={point[0]} data-y={point[1]} style={{ left: `${point[0]/10}%`, top: `${point[1]/10}%` }}>{i < order.node ? "✓" : i+1}</span>)}<span className="cq-gesture-label">{step.technique} · tap or drag</span>
  </div>;
}

export function CuisineQuestResultDetails({ details, saved }: { details: Record<string, number | string>; saved: boolean }) {
  const stars = Number(details.stars ?? 0);
  return <div className="cq-result-detail" data-testid="cq-verified-details"><div className="cq-result-stars"><Stars count={stars} /><strong>{stars}/3 stars</strong></div><div className="cq-result-grid">{[["Orders / plates", `${details.served}/${details.wanted}`],["Perfect dishes", details.perfect],["Mistakes", details.mistakes],["Burnt batches", details.burnt],["Cooking precision", `${details.precision}%`],["Customer satisfaction", `${details.satisfaction}%`]].map(([label,value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div><p>{saved ? `Passport saved · ${details.cuisinesCompleted}/7 cuisines · ${details.totalStars}/21 stars` : "Verified result. Your passport still needs to be saved before the next kitchen opens."}</p></div>;
}

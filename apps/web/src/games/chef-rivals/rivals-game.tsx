"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Carrot, ChefHat, ConciergeBell, CookingPot, Droplets, Flame, Heater, Salad, Slice, Soup, Trophy, WifiOff } from "lucide-react";
import { advanceQuest, applyQuest, byRecipe, chefActivity, CUISINES, questActionSchema, RIVALS_PROTOCOL, STATION_NAMES, type ChefActivity, type Garnish, type QuestIntent, type QuestState, type RivalsView, type RivalSummary, type StationId } from "@platform/engines/cuisine-quest";
import { sfx, unlockAudio } from "@/lib/sound";
import { FoodArt, IngredientArt } from "../cuisine-quest/art";
import { RecipeBook, StationPanel, TicketCard } from "../cuisine-quest/kitchen-ui";
import "../cuisine-quest/cuisine-quest.css";
import type { GameClientProps } from "../types";
import { ChefCharacter, type ChefMood } from "./chef";
import "./chef-rivals.css";

const STATION_ORDER: StationId[] = ["storage", "board", "mixer", "stove", "grill", "fryer", "oven", "plating", "serving"];
const STATION_ICON: Record<StationId, typeof Carrot> = { storage: Carrot, board: Slice, mixer: Soup, stove: CookingPot, grill: Flame, fryer: Droplets, oven: Heater, plating: Salad, serving: ConciergeBell };
const clock = (ms: number) => { const total = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`; };

/** A short reaction when a chef's real kitchen reports an event. */
function useReaction(event: number, lastEvent: string): ChefMood {
  const [mood, setMood] = useState<ChefMood>("calm");
  const seen = useRef(event);
  useEffect(() => {
    if (seen.current === event) return;
    seen.current = event;
    const next: ChefMood = lastEvent === "serve" || lastEvent === "flip" ? "celebrate" : lastEvent === "mistake" || lastEvent === "burnt" || lastEvent === "left" ? "oops" : "calm";
    if (next === "calm") return;
    setMood(next);
    const timer = setTimeout(() => setMood("calm"), 900);
    return () => clearTimeout(timer);
  }, [event, lastEvent]);
  return mood;
}

function Lane({ chef, activity, stations, self, entering }: { chef: Pick<RivalSummary, "id" | "name" | "color" | "served" | "wanted" | "connected" | "event" | "lastEvent">; activity: ChefActivity; stations: StationId[]; self: boolean; entering: boolean }) {
  const mood = useReaction(chef.event, chef.lastEvent);
  const index = Math.max(0, stations.indexOf(activity.station));
  const position = stations.length > 1 ? index / (stations.length - 1) : 0;
  return (
    <div className={`cr-lane ${self ? "cr-lane-self" : ""} ${entering ? "cr-entering" : ""}`} data-testid={self ? "cr-lane-self" : "cr-lane-rival"} data-station={activity.station} data-pose={activity.pose}>
      <div className="cr-lane-label"><strong>{self ? "You" : chef.name}</strong><span>{chef.served}/{chef.wanted} plates</span>{!chef.connected && <span className="cr-offline"><WifiOff size={11} aria-hidden /> Reconnecting</span>}</div>
      <div className="cr-counter" aria-hidden>
        {stations.map((station) => { const Icon = STATION_ICON[station]; return <div key={station} className={`cr-st ${activity.station === station && activity.pose !== "idle" ? "cr-st-busy" : ""}`} title={STATION_NAMES[station]}><Icon size={15} /></div>; })}
      </div>
      <div className="cr-track"><div className="cr-walker" style={{ "--cr-pos": position } as React.CSSProperties}><ChefCharacter id={chef.id} color={chef.color} pose={activity.pose} mood={mood} label={`${self ? "Your chef" : chef.name}: ${activity.pose === "idle" ? "waiting" : activity.pose} at ${STATION_NAMES[activity.station]}`} /></div></div>
    </div>
  );
}

function Stage({ view, kitchen, focus, stations, entering }: { view: RivalsView; kitchen: QuestState | null; focus: number | null; stations: StationId[]; entering: boolean }) {
  const you = view.you;
  return (
    <div className="cr-stage" data-testid="cr-stage">
      {view.rivals.map((rival) => <Lane key={rival.id} chef={rival} activity={rival} stations={stations} self={false} entering={entering} />)}
      {you && kitchen && <Lane chef={{ ...you.summary, served: kitchen.served, event: kitchen.event, lastEvent: kitchen.lastEvent }} activity={chefActivity(kitchen, focus)} stations={stations} self entering={entering} />}
    </div>
  );
}

/** The introduction: real theme and ingredient from the server, on the server's schedule. */
function Reveal({ view, remainingToPlay, selfId, room }: { view: RivalsView; remainingToPlay: number; selfId: string; room: GameClientProps["room"] }) {
  const counting = remainingToPlay <= 3000;
  const players = room.players;
  return (
    <div className="cr-reveal" data-testid="cr-reveal" role="status" aria-live="polite">
      {counting ? <div className="cr-count" key={Math.ceil(remainingToPlay / 1000)} data-testid="cr-countdown">{Math.max(1, Math.ceil(remainingToPlay / 1000))}</div> : <>
        <p className="cq-eyebrow">Tonight's challenge</p>
        <h2 data-testid="cr-theme">{view.theme}</h2>
        <div className="cr-versus">
          {players.slice(0, 2).map((p, i) => <div key={p.id} className={`cr-versus-chef cr-side-${i}`}><ChefCharacter id={p.id} color={p.color} /><strong>{p.id === selfId ? "You" : p.name}</strong></div>)}
          <span className="cr-vs" aria-hidden>VS</span>
        </div>
        <div className="cr-mystery"><IngredientArt id={view.mystery} /><div><span>Mystery ingredient</span><strong data-testid="cr-mystery">{view.mystery.replaceAll("-", " ")}</strong></div></div>
        <div className="cr-basket">{view.basket.map((id) => <div key={id}><FoodArt recipe={id} /><span>{byRecipe.get(id)!.name}</span></div>)}</div>
      </>}
    </div>
  );
}

export function ChefRivalsGame({ game, send, selfId, room }: GameClientProps<RivalsView>) {
  const view = game.view;
  const offset = useRef(0);
  const local = useRef<QuestState | null>(null);
  const [, repaint] = useState(0);
  const [selected, setSelected] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);
  const [portions, setPortions] = useState(1);
  const [garnish, setGarnish] = useState<Garnish>("herbs");
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState(false);
  const warned = useRef(false);
  const started = useRef(false);

  // Each server view is the truth. It replaces whatever the browser predicted.
  useEffect(() => {
    offset.current = view.now - Date.now();
    local.current = view.you ? (JSON.parse(JSON.stringify(view.you.kitchen)) as QuestState) : null;
    repaint((n) => n + 1);
  }, [game.version, view]);

  const serverNow = () => Date.now() + offset.current;
  const cookingClock = () => Math.max(0, Math.min(view.durationMs, serverNow() - view.playAt));

  // Between server views, cooking and patience run locally for smooth display only.
  useEffect(() => {
    const timer = setInterval(() => {
      const kitchen = local.current;
      if (kitchen && view.phase === "cooking" && !kitchen.finished) advanceQuest(kitchen, cookingClock());
      repaint((n) => n + 1);
    }, 100);
    return () => clearInterval(timer);
  });

  // The game covers the page while cooking, as the campaign does.
  useEffect(() => {
    const previous = document.body.style.overflow;
    const footers = [...document.querySelectorAll<HTMLElement>("body footer")];
    const prior = footers.map((el) => el.inert);
    document.body.style.overflow = "hidden";
    footers.forEach((el) => { el.inert = true; });
    return () => { document.body.style.overflow = previous; footers.forEach((el, i) => { el.inert = prior[i]!; }); };
  }, []);

  const act = useCallback((intent: QuestIntent) => {
    const kitchen = local.current;
    if (!kitchen || view.phase !== "cooking") return false;
    unlockAudio();
    const predicted = questActionSchema.safeParse({ ...intent, t: Math.max(kitchen.t, cookingClock()) });
    if (!predicted.success) return false;
    // Show the result now, so controls feel immediate. The server's next view confirms or corrects it.
    const result = applyQuest(kitchen, predicted.data);
    if (!result.ok) { setError(result.error ?? "Try that step again."); repaint((n) => n + 1); return false; }
    setError(null);
    if ("order" in intent) setFocus(intent.order);
    if (kitchen.lastEvent === "serve") sfx.serve(); else if (kitchen.lastEvent === "mistake") sfx.error(); else if (kitchen.lastEvent === "flip") sfx.flip(); else if (kitchen.lastEvent === "chop" || kitchen.lastEvent === "slice") sfx.chop(); else sfx.pickup();
    repaint((n) => n + 1);
    void send("kitchen:act", { p: RIVALS_PROTOCOL, intent }).then((ack) => {
      if (!ack.ok) {
        setError(ack.error.message);
        if (view.you) { local.current = JSON.parse(JSON.stringify(view.you.kitchen)) as QuestState; repaint((n) => n + 1); }
      }
    });
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, view]);

  const kitchen = local.current;
  const remaining = view.durationMs - cookingClock();
  const toPlay = view.playAt - serverNow();
  const phase = view.phase !== "cooking" && view.phase !== "finished" && toPlay <= 0 ? "cooking" : view.phase;
  const warning = phase === "cooking" && remaining <= 30_000;

  useEffect(() => { if (phase === "cooking" && !started.current) { started.current = true; sfx.win?.(); } }, [phase]);
  useEffect(() => { if (warning && !warned.current) { warned.current = true; sfx.yourTurn?.(); } }, [warning]);

  const waiting = kitchen?.orders.filter((o) => o.status === "waiting") ?? [];
  const selectedOrder = kitchen?.orders[selected];
  useEffect(() => { if (selectedOrder && selectedOrder.status !== "waiting" && waiting[0]) setSelected(waiting[0].id); }, [selectedOrder?.status, waiting.map((o) => o.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedOrder) setGarnish(selectedOrder.garnish); }, [selected, selectedOrder?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const stations = useMemo(() => {
    const used = new Set<StationId>(["storage", "serving"]);
    for (const order of view.you?.kitchen.orders ?? []) for (const step of byRecipe.get(order.recipe)!.steps) used.add(step.station);
    return STATION_ORDER.filter((s) => used.has(s));
  }, [view.you?.kitchen.orders]);

  const select = (id: number) => { setSelected(id); setPortions(1); setError(null); sfx.pickup(); };
  const cuisine = CUISINES[(view.you?.kitchen.level ?? 1) - 1]!;
  const rival = view.rivals[0];

  return (
    <section className="cq-game cr-game" data-testid="chef-rivals" data-phase={phase} data-warning={warning} style={{ "--cq-accent": "#ff9a6b", "--cq-dark": "#2a1533", "--cq-wall": cuisine.wall } as React.CSSProperties}>
      <header className="cq-game-top">
        <div><span className="cq-eyebrow">Chef Rivals · {view.theme}</span><h2>Mystery: {view.mystery.replaceAll("-", " ")}</h2></div>
        <div className={`cq-clock ${warning ? "cr-clock-warn" : ""}`} role="timer" aria-label="Time left" data-testid="cr-clock">{clock(remaining)}{warning ? <small>Final plating!</small> : <small>{kitchen?.served ?? 0} / {view.you?.summary.wanted ?? 0} plates</small>}</div>
      </header>
      <Stage view={view} kitchen={kitchen} focus={focus} stations={stations} entering={phase !== "cooking"} />
      {phase !== "cooking" && phase !== "finished" ? <Reveal view={view} remainingToPlay={toPlay} selfId={selfId} room={room} /> : kitchen && <>
        <div className="cq-tickets" aria-label="Customer orders">{kitchen.orders.filter((order) => order.status !== "queued").map((order) => <TicketCard key={order.id} order={order} s={kitchen} selected={selected} seed={kitchen.seed} garnish={garnish} select={select} send={act} />)}</div>
        <div className="cq-workspace">
          <aside className="cq-book-desktop">{selectedOrder && <RecipeBook order={selectedOrder} />}</aside>
          {kitchen.finished ? <div className="cq-station cr-done" data-testid="cr-done"><Trophy size={44} aria-hidden /><h3>Service complete</h3><p>{rival && !rival.done ? `Waiting for ${rival.name} to finish. Your score is safe.` : "Heading to the judges…"}</p></div> : <StationPanel s={kitchen} selected={selected} showPortions portions={portions} setPortions={setPortions} garnish={garnish} setGarnish={setGarnish} send={act} />}
          <aside className="cq-station-shelf cr-scoreboard">
            <p className="cq-eyebrow">Live board</p>
            <div><ChefHat size={15} aria-hidden /><span>You</span><strong>{kitchen.served}/{view.you?.summary.wanted}</strong></div>
            {view.rivals.map((r) => <div key={r.id} data-testid="cr-rival-tally"><ChefHat size={15} aria-hidden /><span>{r.name}</span><strong>{r.served}/{r.wanted}</strong></div>)}
            <p>Judges reward correct, well-cooked plates far more than speed. A secret challenge is revealed at the end.</p>
          </aside>
        </div>
        <div className={`cq-feedback ${error || kitchen.feedbackKind === "error" ? "cq-feedback-error" : ""}`} role="status" aria-live="polite" data-testid="cr-feedback">{error ?? kitchen.feedback}</div>
        <footer className="cq-game-bottom"><button className="cq-action" onClick={() => setBook(true)}><BookOpen size={17} />Recipe</button><span>{kitchen.orders.filter((o) => o.batchActive).length}/2 batches · {kitchen.perfect} perfect</span><button className="cq-action" disabled={!selectedOrder?.batchActive || kitchen.finished} onClick={() => act({ kind: "restart", order: selected })}>Restart batch</button></footer>
        {book && selectedOrder && <div className="cq-pause" role="dialog" aria-modal="true" aria-label="Recipe book" onKeyDown={(e) => { if (e.key === "Escape") setBook(false); }}><div className="cq-pause-paper cq-open-book"><RecipeBook order={selectedOrder} /><p className="cr-no-pause">The clock keeps running in a duel.</p><button className="cq-primary" autoFocus onClick={() => setBook(false)}>Back to cooking</button></div></div>}
      </>}
    </section>
  );
}

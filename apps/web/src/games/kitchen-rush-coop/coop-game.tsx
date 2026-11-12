"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Flame, Trash2, WifiOff } from "lucide-react";
import { COOP_PROTOCOL, customerValue, ITEMS, RECIPES, stationForm, STATION_NAMES, type CoopView, type CookPose, type Customer } from "@platform/engines/kitchen-rush";
import { sfx, unlockAudio } from "@/lib/sound";
import { CustomerFigure, type Mood } from "../kitchen-rush/art/customer";
import { Dish, FoodSprite } from "../kitchen-rush/art/food";
import { StationArt } from "../kitchen-rush/art/stations";
import { ChefCharacter, type ChefMood } from "../chef-rivals/chef";
import "../chef-rivals/chef-rivals.css";
import type { GameClientProps } from "../types";
import "./kitchen-rush-coop.css";

const MESSAGES: Record<string, (e: never) => string> = {
  served: (e: { points: number; tip: number }) => `Order up! +${e.points + e.tip}`,
  wrong: () => "Wrong dish! The guest left unhappy.",
  left: () => "A guest gave up waiting.",
  burnt: () => "Something burnt! Clear it and start again.",
};
const patienceLeft = (c: Customer, t: number) => Math.max(0, (c.arrivedAt! + c.patienceMs - t) / c.patienceMs);
const moodFor = (left: number): Mood => (left > 0.6 ? "happy" : left > 0.35 ? "neutral" : left > 0.15 ? "impatient" : "angry");

export function KitchenCoopGame({ game, send, selfId }: GameClientProps<CoopView>) {
  const view = game.view;
  const received = useRef({ at: Date.now(), offset: 0 });
  const floor = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [, repaint] = useState(0);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [mood, setMood] = useState<ChefMood>("calm");
  const [pressed, setPressed] = useState<string | null>(null);
  const seenEvent = useRef(view.eventSeq);

  useEffect(() => { received.current = { at: Date.now(), offset: view.now - Date.now() }; }, [game.version, view.now]);
  useEffect(() => { const timer = setInterval(() => repaint((n) => n + 1), 100); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const previous = document.body.style.overflow;
    const footers = [...document.querySelectorAll<HTMLElement>("body footer")];
    const prior = footers.map((el) => el.inert);
    document.body.style.overflow = "hidden";
    footers.forEach((el) => { el.inert = true; });
    return () => { document.body.style.overflow = previous; footers.forEach((el, i) => { el.inert = prior[i]!; }); };
  }, []);

  // Sounds and chef reactions follow what the server says happened.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    for (const { seq, e } of view.events) {
      if (seq <= seenEvent.current) continue;
      seenEvent.current = seq;
      const message = MESSAGES[e.kind];
      if (message) setNote({ text: (message as (x: unknown) => string)(e), bad: e.kind !== "served" });
      if (e.kind === "served") { sfx.serve(); setMood("celebrate"); }
      else if (e.kind === "wrong" || e.kind === "left" || e.kind === "burnt") { sfx.error(); setMood("oops"); }
      else if (e.kind === "plate") sfx.plateClink();
      else if (e.kind === "arrive") sfx.doorChime();
    }
    timer = setTimeout(() => setMood("calm"), 900);
    return () => clearTimeout(timer);
  }, [view.eventSeq, view.events]);

  // Chefs walk to the thing they last used, measured from the real layout.
  useLayoutEffect(() => {
    const measure = () => {
      const box = floor.current?.getBoundingClientRect();
      if (!box) return;
      const next: Record<string, { x: number; y: number }> = {};
      view.cooks.forEach((cook, i) => {
        const el = cook.target ? floor.current!.querySelector<HTMLElement>(`[data-target="${cook.target}"]`) : null;
        const rect = el?.getBoundingClientRect();
        next[cook.id] = rect ? { x: rect.x - box.x + rect.width / 2 + (i - 1.5) * 10, y: rect.y - box.y + rect.height * 0.45 } : { x: box.width * (0.2 + i * 0.2), y: box.height * 0.5 };
      });
      setPositions((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [view.cooks, view.phase]);

  const tap = useCallback((target: string) => {
    unlockAudio();
    setPressed(target);
    setTimeout(() => setPressed((p) => (p === target ? null : p)), 180);
    void send("kitchen:tap", { p: COOP_PROTOCOL, target }).then((ack) => { if (!ack.ok) { setNote({ text: ack.error.message, bad: true }); sfx.error(); } });
  }, [send]);
  const hit = (target: string) => ({ "data-target": target, "data-pressed": pressed === target, onClick: () => tap(target) });

  const serverNow = Date.now() + received.current.offset;
  const t = view.phase === "cooking" ? view.t + (Date.now() - received.current.at) : view.t;
  const toPlay = view.playAt - serverNow;
  const hand = view.hands[selfId] ?? null;
  const held = hand?.kind === "item" ? ITEMS[hand.item].name : hand?.kind === "plate" ? `Plate ${hand.plate + 1}` : null;
  const def = view.kitchenDef;

  if (view.phase === "intro" || view.phase === "countdown") {
    return <section className="kc-game kc-opening" data-testid="kitchen-coop" data-phase={view.phase}>
      <div className="kc-intro" role="status" aria-live="polite" data-testid="kc-intro">
        {toPlay <= 3000 ? <div className="cr-count" key={Math.ceil(toPlay / 1000)} data-testid="kc-countdown">{Math.max(1, Math.ceil(toPlay / 1000))}</div> : <>
          <p>Kitchen {def.number} of 7</p><h2>{def.name}</h2><span>{def.twist}</span>
          <div className="kc-crew">{view.cooks.map((cook) => <div key={cook.id}><ChefCharacter id={cook.id} color={cook.color} /><strong>{cook.id === selfId ? "You" : cook.name}</strong></div>)}</div>
        </>}
      </div>
    </section>;
  }

  return (
    <section className="kc-game" data-testid="kitchen-coop" data-phase={view.phase}>
      <header className="kc-top">
        <div className="kc-title"><span>Kitchen {def.number}</span><strong>{def.name}</strong></div>
        <div className="kc-stat" data-testid="kc-score"><small>Team score</small><strong>{view.score}</strong></div>
        <div className="kc-stat"><small>Served</small><strong data-testid="kc-served">{view.served}</strong></div>
        <div className="kc-stat"><small>Still to come</small><strong>{view.upcoming}</strong></div>
        {def.combos && view.combo > 1 && <div className="kc-combo" data-testid="kc-combo" key={view.combo}>Combo ×{view.combo}</div>}
      </header>

      <div className="kc-floor" ref={floor}>
        <div className="kc-seats" aria-label="Guests">
          {Array.from({ length: view.seats }, (_, seat) => {
            const guest = view.customers.find((c) => c.seat === seat);
            const left = guest ? patienceLeft(guest, t) : 0;
            return <button type="button" key={seat} className="kc-seat" data-testid={`kc-seat-${seat}`} disabled={!guest} {...hit(`seat:${seat}`)} aria-label={guest ? `Serve guest ${seat + 1}: ${RECIPES[guest.recipe].name}, worth ${customerValue(guest)}` : `Seat ${seat + 1}, empty`}>
              {guest ? <>
                <div className="kc-guest"><CustomerFigure type={guest.type} seed={guest.id} mood={moodFor(left)} /></div>
                <div className="kc-ticket"><Dish parts={RECIPES[guest.recipe].parts} animate={false} /><strong>{RECIPES[guest.recipe].name}</strong><span>{RECIPES[guest.recipe].parts.map((p) => ITEMS[p].name).join(" · ")}</span>
                  <i className="kc-patience" role="meter" aria-label="Patience" aria-valuenow={Math.round(left * 100)} aria-valuemin={0} aria-valuemax={100}><b style={{ transform: `scaleX(${left})`, background: left > 0.35 ? "#2fbf6f" : "#e8343f" }} /></i>
                </div>
              </> : <span className="kc-empty">Open seat</span>}
            </button>;
          })}
        </div>

        <div className="kc-stations" aria-label="Stations">
          {view.stations.map((st) => {
            const target = `st:${st.type}:${st.index}`;
            const form = stationForm(st, t);
            const hazard = view.hazard?.target === target;
            return <button type="button" key={target} className="kc-station" data-testid={`station-${st.type}-${st.index}`} data-state={form.state} data-hazard={hazard} {...hit(target)} aria-label={`${STATION_NAMES[st.type]} ${st.index + 1}: ${form.item ? `${ITEMS[form.item].name}, ${form.state}` : "empty"}${hazard ? ", flare-up, can't be touched" : ""}`}>
              <StationArt type={st.type} item={form.item} state={form.state} progress={form.progress} flipped={st.type === "grill" && (form.state !== "working" || form.progress >= 0.5)} />
              {form.state === "done" && <em className="kc-ready">Ready</em>}
              {form.state === "burning" && <em className="kc-burning">Hurry!</em>}
              {hazard && <em className="kc-flare"><Flame size={13} aria-hidden /> Flare-up</em>}
            </button>;
          })}
        </div>

        <div className="kc-shelf">
          <div className="kc-crates" aria-label="Ingredients">{view.crates.map((item) => {
            const stock = view.stock?.[item];
            return <button type="button" key={item} className="kc-crate" data-testid={`crate-${item}`} {...hit(`crate:${item}`)} disabled={stock === 0} aria-label={`Take ${ITEMS[item].name}${stock !== undefined ? `, ${stock} left` : ""}`}><FoodSprite item={item} size={34} /><span>{ITEMS[item].name}</span>{stock !== undefined && <small data-testid={`stock-${item}`}>{stock} left</small>}</button>;
          })}</div>
          <div className="kc-plates" aria-label="Plates">{view.plates.map((parts, i) => {
            const holder = view.cooks.find((c) => { const h = view.hands[c.id]; return h?.kind === "plate" && h.plate === i; });
            return <button type="button" key={i} className="kc-plate" data-testid={`kc-plate-${i}`} {...hit(`plate:${i}`)} aria-label={`Plate ${i + 1}: ${parts.length ? parts.map((p) => ITEMS[p].name).join(", ") : "empty"}${holder ? `, held by ${holder.id === selfId ? "you" : holder.name}` : ""}`}><Dish parts={[...parts]} animate={false} />{holder && <small>{holder.id === selfId ? "You" : holder.name}</small>}</button>;
          })}<button type="button" className="kc-trash" data-testid="kc-trash" {...hit("trash")} aria-label="Throw away what you're holding"><Trash2 size={22} aria-hidden /></button></div>
        </div>

        <div className="kc-cooks" aria-hidden>
          {view.cooks.filter((c) => !c.left).map((cook) => {
            const place = positions[cook.id];
            const h = view.hands[cook.id];
            return <div key={cook.id} className={`kc-cook ${cook.id === selfId ? "kc-cook-self" : ""}`} data-testid={`kc-cook-${cook.id === selfId ? "self" : "other"}`} data-pose={cook.pose} style={{ transform: `translate(${place?.x ?? 0}px, ${place?.y ?? 0}px)` }}>
              <ChefCharacter id={cook.id} color={cook.color} pose={cook.pose as CookPose} mood={mood} />
              {h?.kind === "item" && <span className="kc-carry"><FoodSprite item={h.item} size={24} /></span>}
              {h?.kind === "plate" && <span className="kc-carry"><Dish parts={[...view.plates[h.plate]!]} animate={false} /></span>}
              <small>{cook.id === selfId ? "You" : cook.name}{!cook.connected && <WifiOff size={10} />}</small>
            </div>;
          })}
        </div>
      </div>
      <footer className={`kc-status ${note?.bad ? "kc-status-bad" : ""}`} role="status" aria-live="polite" data-testid="kc-status"><strong data-testid="kc-holding">{held ? `Holding: ${held}` : "Hands free"}</strong><span>{note?.text ?? def.twist}</span></footer>
    </section>
  );
}

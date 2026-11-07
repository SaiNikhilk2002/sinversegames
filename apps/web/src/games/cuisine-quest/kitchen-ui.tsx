"use client";

import { BookOpen, Compass } from "lucide-react";
import { useRef } from "react";
import { cookForm, currentRecipe, currentStep, GESTURE_GAP_MS, pantryFor, PATHS, questHint, STATION_NAMES, type Garnish, type Order, type QuestIntent, type QuestState } from "@platform/engines/cuisine-quest";
import { CustomerPortrait, FoodArt, IngredientArt, PreparationArt } from "./art";

/** The hands-on cooking controls, shared by the campaign and multiplayer kitchens. Everything acts through intents. */

export interface StationPanelProps { s: QuestState; selected: number; showPortions: boolean; portions: number; setPortions: (n: number) => void; garnish: Garnish; setGarnish: (g: Garnish) => void; send: (intent: QuestIntent) => boolean }
export function StationPanel({ s, selected, showPortions, portions, setPortions, garnish, setGarnish, send }: StationPanelProps) {
  const o = s.orders[selected]!; const step = currentStep(o); const recipe = currentRecipe(o);
  const hint = questHint(s, selected);
  const actualStage = !step ? "perfect" : step.kind === "cook" && o.startedAt !== null ? cookForm(o) : o.step > 3 ? "prepared" : "raw";
  return <div className="cq-station" data-testid="cq-station">
        <div className="cq-station-caption"><span>{!step ? "Serving counter" : STATION_NAMES[step.station]}</span><small>Ticket {selected+1} · {o.delivered+1}/{o.wanted}</small></div>
        {o.status !== "waiting" ? <div className="cq-waiting"><Compass size={40} /><h3>Service continues</h3><p>Take a breath. The next guest is on the way.</p></div> : <>
          <div className="cq-current-recipe"><h3>{recipe.name}</h3><span>{Math.min(o.step+1, recipe.steps.length)} / {recipe.steps.length}</span></div>
          {step?.kind === "ingredient" ? <div className="cq-pantry">
            <div className="cq-pantry-cue"><IngredientArt id={step.ingredient} /><p>{step.label}<strong>{step.portions} portion{step.portions > 1 ? "s" : ""}</strong></p></div>
            {showPortions && <div className="cq-portions" role="group" aria-label="Ingredient portions">{[1,2,3].map(n => <button key={n} aria-pressed={portions === n} onClick={() => setPortions(n)}>{n} portion{n > 1 ? "s" : ""}</button>)}</div>}
            <div className="cq-ingredients">{pantryFor(recipe).map(id => <button type="button" key={id} data-ingredient={id} data-testid={`cq-ingredient-${id}`} draggable onDragStart={e => e.dataTransfer.setData("text/cq-ingredient", id)} onClick={() => send({ kind: "ingredient", order: selected, ingredient: id, portions })}><IngredientArt id={id} /><span>{id.replaceAll("-", " ")}</span></button>)}</div>
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
      </div>;
}

export function TicketCard({ order, s, selected, seed, garnish, select, send }: { order: Order; s: QuestState; selected: number; seed: number; garnish: Garnish; select: (id: number) => void; send: (intent: QuestIntent) => boolean }) {

      const remaining = order.status === "waiting" ? Math.max(0, 1 - (s.t - order.arrivedAt!) / order.patienceMs) : 0;
      const mood = order.status === "served" ? "celebrating" : order.status === "left" ? "angry" : order.id === selected && s.feedbackKind === "error" ? "impatient" : remaining < .25 ? "impatient" : order.type === "patient" ? "happy" : "hungry";
      return <button type="button" className={`cq-ticket ${selected === order.id ? "cq-ticket-selected" : ""} ${order.status === "served" ? "cq-ticket-served" : ""}`} data-testid={`cq-ticket-${order.id}`} data-order={order.id} data-status={order.status} disabled={order.status !== "waiting"} onClick={() => select(order.id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const from = e.dataTransfer.getData("text/cq-plate"); if (from !== "") send({ kind: "serve", order: Number(from), recipient: order.id, garnish }); }} aria-label={`Ticket ${order.id+1}: ${currentRecipe(order).name}, ${order.garnish} finish, ${order.type} guest`}>
        <CustomerPortrait seed={seed + order.id} mood={mood} color={["#7b6f98","#b16c59","#689182","#b19d62","#688c9d","#94785e"][order.id]!} /><div><span className="cq-ticket-name">{currentRecipe(order).name}</span><small>{order.type === "large" ? `${order.delivered}/2 plates` : order.type} · {order.garnish}</small><span className="cq-patience" role="meter" aria-label={`Ticket ${order.id+1} patience`} aria-valuenow={Math.round(remaining*100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${remaining*100}%`, background: remaining < .25 ? "#ed8b6a" : "#bdd08a" }} /></span>{order.status !== "waiting" && <small>{order.status === "served" ? "Thank you, chef!" : "Guest left"}</small>}</div>
      </button>;
    }

export function RecipeBook({ order }: { order: Order }) {
  const recipe = currentRecipe(order);
  return <div className="cq-recipe-book"><p className="cq-eyebrow">Chef's field notes</p><h3>{recipe.name}</h3><p>{recipe.description}</p><p className="cq-guest-note">Ticket {order.id+1} · {order.wanted} plate{order.wanted > 1 ? "s" : ""} · {order.garnish} finish</p><ol>{recipe.steps.map((step, i) => <li key={i} className={i === order.step ? "cq-step-current" : i < order.step ? "cq-step-done" : ""}><span>{i < order.step ? "✓" : String(i+1).padStart(2,"0")}</span><div>{step.label}{step.kind === "ingredient" && <small>{step.portions} portion{step.portions > 1 ? "s" : ""}</small>}{step.kind === "cook" && <small>{step.ms/1000}s at heat {step.heat}{step.flip ? " · flip at halfway" : ""}{step.stirs ? ` · ${step.stirs} timed stir${step.stirs > 1 ? "s" : ""}` : ""}</small>}</div></li>)}</ol></div>;
}
export function TechniquePad({ order, send }: { order: Order; send: (intent: QuestIntent) => boolean }) {
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


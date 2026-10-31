import { z } from "zod";
import type { MatchResults } from "@platform/shared";
import { shuffle } from "../core/rng";
import {
  fail,
  toAll,
  type EngineContext,
  type EngineResult,
  type EngineSuccess,
  type GameEngine,
  type OutboundMessage,
  type PlayerRef,
} from "../core/types";
import { CARD_COLORS, buildDeck, compareCards, isWild, type Card, type CardColor } from "./cards";
import { colorClashConfigSchema, DISCONNECTED_TURN_MS, type ColorClashConfig } from "./config";
import { canPlay, drawPenalty } from "./rules";
import { DEFAULT_SCORING, scoreMatch } from "./scoring";

export interface CCPlayer extends PlayerRef {
  hand: Card[];
  connected: boolean;
  disconnectedAt: number | null;
  /** Left the match permanently; skipped in turn order. */
  left: boolean;
  timeouts: number;
}

export type CCPublicAction =
  | { kind: "play"; playerId: string; card: Card; chosenColor: CardColor | null }
  | { kind: "draw"; playerId: string; count: number; penalty: boolean }
  | { kind: "pass"; playerId: string }
  | { kind: "skipped"; playerId: string }
  | { kind: "flip"; direction: 1 | -1 }
  | { kind: "timeout"; playerId: string }
  | { kind: "reshuffle"; count: number }
  | { kind: "left"; playerId: string }
  | { kind: "win"; playerId: string };

export interface CCState {
  config: ColorClashConfig;
  players: CCPlayer[];
  drawPile: Card[];
  discard: Card[];
  activeColor: CardColor;
  /** 1 = clockwise (seat order), -1 = counter-clockwise. */
  direction: 1 | -1;
  current: number;
  /** Draw penalty accumulated by stacking (+2/+4 house rule). */
  pendingDraw: number;
  /** Set after the current player draws a playable card: they may play only that card or pass. */
  drawnCardId: string | null;
  turnStartedAt: number;
  turnNumber: number;
  status: "playing" | "finished";
  winnerId: string | null;
  endReason: MatchResults["reason"] | null;
  endedAt: number | null;
  startedAt: number;
}

export const colorClashActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("card:play"),
    cardId: z.string().min(1).max(16),
    chosenColor: z.enum(CARD_COLORS).optional(),
  }),
  z.object({ type: z.literal("card:draw") }),
  z.object({ type: z.literal("card:pass") }),
]);
export type ColorClashAction = z.infer<typeof colorClashActionSchema>;

export interface CCPlayerView {
  id: string;
  name: string;
  color: string;
  cardCount: number;
  connected: boolean;
  left: boolean;
}

export interface CCView {
  status: CCState["status"];
  players: CCPlayerView[];
  currentPlayerId: string;
  direction: 1 | -1;
  topCard: Card;
  activeColor: CardColor;
  drawPileCount: number;
  discardCount: number;
  pendingDraw: number;
  turnStartedAt: number;
  turnDeadline: number | null;
  turnNumber: number;
  winnerId: string | null;
  config: ColorClashConfig;
  /** The viewer's own private data. */
  you: {
    id: string;
    hand: Card[];
    playableIds: string[];
    /** Card id the viewer just drew and may play (only on their own turn). */
    drawnCardId: string | null;
    isTurn: boolean;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeCount = (s: CCState) => s.players.filter((p) => !p.left).length;

/** Index `steps` active seats away from `from` in the current direction. */
function seatAfter(s: CCState, from: number, steps = 1): number {
  let idx = from;
  let moved = 0;
  const n = s.players.length;
  for (let guard = 0; moved < steps && guard < n * (steps + 1); guard++) {
    idx = (idx + s.direction + n) % n;
    if (!s.players[idx]!.left) moved++;
  }
  return idx;
}

function startTurn(s: CCState, index: number, now: number) {
  s.current = index;
  s.drawnCardId = null;
  s.turnStartedAt = now;
  s.turnNumber++;
}

/** Draws up to `count` cards, reshuffling the discard pile (minus its top card) when needed. */
function drawCards(s: CCState, count: number, ctx: EngineContext, log: CCPublicAction[]): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) {
      if (s.discard.length <= 1) break; // every card is in someone's hand
      const top = s.discard.pop()!;
      s.drawPile = shuffle(s.discard, ctx.rng);
      s.discard = [top];
      log.push({ kind: "reshuffle", count: s.drawPile.length });
    }
    drawn.push(s.drawPile.pop()!);
  }
  return drawn;
}

function playContext(s: CCState, hand: readonly Card[]) {
  return { top: s.discard[s.discard.length - 1]!, activeColor: s.activeColor, pendingDraw: s.pendingDraw, hand, config: s.config };
}

function finish(s: CCState, winnerId: string | null, reason: MatchResults["reason"], now: number, log: CCPublicAction[]) {
  s.status = "finished";
  s.winnerId = winnerId;
  s.endReason = reason;
  s.endedAt = now;
  if (winnerId) log.push({ kind: "win", playerId: winnerId });
}

function done(s: CCState, log: CCPublicAction[]): EngineSuccess<CCState> {
  const messages: OutboundMessage[] = log.length ? [{ to: toAll, event: "game:action", payload: { actions: log } }] : [];
  return { ok: true, state: s, stateChanged: true, messages };
}

/** Gives the next player a draw penalty and skips them (non-stacking rule). */
function applyPenaltyToNext(s: CCState, amount: number, ctx: EngineContext, log: CCPublicAction[]) {
  const victimIdx = seatAfter(s, s.current, 1);
  const victim = s.players[victimIdx]!;
  victim.hand.push(...drawCards(s, amount, ctx, log));
  log.push({ kind: "draw", playerId: victim.id, count: amount, penalty: true }, { kind: "skipped", playerId: victim.id });
  startTurn(s, seatAfter(s, s.current, 2), ctx.now);
}

/** Current player takes the accumulated stacking penalty; their turn ends. */
function takePendingPenalty(s: CCState, ctx: EngineContext, log: CCPublicAction[]) {
  const player = s.players[s.current]!;
  const cards = drawCards(s, s.pendingDraw, ctx, log);
  player.hand.push(...cards);
  log.push({ kind: "draw", playerId: player.id, count: cards.length, penalty: true });
  s.pendingDraw = 0;
  startTurn(s, seatAfter(s, s.current, 1), ctx.now);
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function create(players: PlayerRef[], config: ColorClashConfig, ctx: EngineContext): EngineSuccess<CCState> {
  if (players.length < 2 || players.length > 4) throw new Error("Color Clash needs 2–4 players");
  const deck = shuffle(buildDeck(), ctx.rng);
  const ccPlayers: CCPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    hand: [],
    connected: true,
    disconnectedAt: null,
    left: false,
    timeouts: 0,
  }));
  // Deal one card at a time, like a physical deal.
  for (let round = 0; round < config.handSize; round++) {
    for (const p of ccPlayers) p.hand.push(deck.pop()!);
  }
  // The starting card must be a number card; others are returned at random depths.
  let start = deck.pop()!;
  while (start.kind !== "number") {
    deck.splice(ctx.rng.int(deck.length + 1), 0, start);
    start = deck.pop()!;
  }

  const state: CCState = {
    config,
    players: ccPlayers,
    drawPile: deck,
    discard: [start],
    activeColor: start.color!,
    direction: 1,
    current: ctx.rng.int(ccPlayers.length),
    pendingDraw: 0,
    drawnCardId: null,
    turnStartedAt: ctx.now,
    turnNumber: 1,
    status: "playing",
    winnerId: null,
    endReason: null,
    endedAt: null,
    startedAt: ctx.now,
  };
  return { ok: true, state, stateChanged: true, messages: [] };
}

function handleAction(s: CCState, playerId: string, action: ColorClashAction, ctx: EngineContext): EngineResult<CCState> {
  if (s.status !== "playing") return fail("GAME_NOT_ACTIVE", "The game has ended");
  const player = s.players[s.current]!;
  if (player.id !== playerId) {
    return s.players.some((p) => p.id === playerId && !p.left)
      ? fail("NOT_YOUR_TURN", "It's not your turn")
      : fail("NOT_IN_ROOM", "You are not playing in this match");
  }
  const log: CCPublicAction[] = [];

  switch (action.type) {
    case "card:play": {
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return fail("INVALID_MOVE", "That card isn't in your hand");
      if (s.drawnCardId && card.id !== s.drawnCardId) {
        return fail("INVALID_MOVE", "You can only play the card you just drew, or pass");
      }
      if (!canPlay(card, playContext(s, player.hand))) return fail("INVALID_MOVE", "That card can't be played right now");
      if (isWild(card) && !action.chosenColor) return fail("INVALID_MOVE", "Choose a colour for your Prism card");
      if (!isWild(card) && action.chosenColor) return fail("INVALID_MOVE", "Only Prism cards let you choose a colour");

      // --- validated; mutate from here on ---
      player.hand.splice(player.hand.indexOf(card), 1);
      s.discard.push(card);
      s.activeColor = card.color ?? action.chosenColor!;
      s.drawnCardId = null;
      log.push({ kind: "play", playerId, card, chosenColor: isWild(card) ? action.chosenColor! : null });

      switch (card.kind) {
        case "number":
        case "prism":
          startTurn(s, seatAfter(s, s.current, 1), ctx.now);
          break;
        case "block": {
          const skipped = s.players[seatAfter(s, s.current, 1)]!;
          log.push({ kind: "skipped", playerId: skipped.id });
          startTurn(s, seatAfter(s, s.current, 2), ctx.now);
          break;
        }
        case "flip": {
          s.direction = s.direction === 1 ? -1 : 1;
          log.push({ kind: "flip", direction: s.direction });
          if (activeCount(s) === 2) {
            // With two players a Flip returns the turn to the player who played it.
            const skipped = s.players[seatAfter(s, s.current, 1)]!;
            log.push({ kind: "skipped", playerId: skipped.id });
            startTurn(s, s.current, ctx.now);
          } else {
            startTurn(s, seatAfter(s, s.current, 1), ctx.now);
          }
          break;
        }
        case "plus2":
        case "prism4": {
          if (s.config.stackDrawCards) {
            s.pendingDraw += drawPenalty(card);
            startTurn(s, seatAfter(s, s.current, 1), ctx.now);
          } else {
            applyPenaltyToNext(s, drawPenalty(card), ctx, log);
          }
          break;
        }
      }
      // Effects of the final card (e.g. a +2) still apply, which affects scoring.
      if (player.hand.length === 0) finish(s, playerId, "completed", ctx.now, log);
      return done(s, log);
    }

    case "card:draw": {
      if (s.drawnCardId) return fail("INVALID_MOVE", "You already drew — play that card or pass");
      if (s.pendingDraw > 0) {
        takePendingPenalty(s, ctx, log);
        return done(s, log);
      }
      const drawn: Card[] = [];
      do {
        const next = drawCards(s, 1, ctx, log);
        if (next.length === 0) break;
        drawn.push(next[0]!);
      } while (s.config.drawUntilPlayable && !canPlay(drawn[drawn.length - 1]!, playContext(s, player.hand)));
      player.hand.push(...drawn);
      log.push({ kind: "draw", playerId, count: drawn.length, penalty: false });

      const last = drawn[drawn.length - 1];
      if (last && canPlay(last, playContext(s, player.hand))) {
        s.drawnCardId = last.id; // same player keeps the turn to play it or pass
      } else {
        if (!last) log.push({ kind: "pass", playerId });
        startTurn(s, seatAfter(s, s.current, 1), ctx.now);
      }
      return done(s, log);
    }

    case "card:pass": {
      if (!s.drawnCardId) return fail("INVALID_MOVE", "You can only pass after drawing a card");
      log.push({ kind: "pass", playerId });
      startTurn(s, seatAfter(s, s.current, 1), ctx.now);
      return done(s, log);
    }
  }
}

function nextDeadline(s: CCState): number | null {
  if (s.status !== "playing") return null;
  const cur = s.players[s.current]!;
  let deadline = s.config.turnSeconds > 0 ? s.turnStartedAt + s.config.turnSeconds * 1000 : Infinity;
  if (!cur.connected) {
    deadline = Math.min(deadline, Math.max(s.turnStartedAt, cur.disconnectedAt ?? s.turnStartedAt) + DISCONNECTED_TURN_MS);
  }
  return Number.isFinite(deadline) ? deadline : null;
}

/** Turn timeout: take any pending penalty, otherwise draw one card; the turn always ends. */
function tick(s: CCState, ctx: EngineContext): EngineSuccess<CCState> {
  const deadline = nextDeadline(s);
  if (deadline === null || ctx.now < deadline) return { ok: true, state: s, stateChanged: false, messages: [] };
  const player = s.players[s.current]!;
  player.timeouts++;
  const log: CCPublicAction[] = [{ kind: "timeout", playerId: player.id }];
  if (s.pendingDraw > 0) {
    takePendingPenalty(s, ctx, log);
  } else {
    if (!s.drawnCardId) {
      const cards = drawCards(s, 1, ctx, log);
      player.hand.push(...cards);
      log.push({ kind: "draw", playerId: player.id, count: cards.length, penalty: false });
    }
    startTurn(s, seatAfter(s, s.current, 1), ctx.now);
  }
  return done(s, log);
}

function setConnected(s: CCState, playerId: string, connected: boolean, ctx: EngineContext): EngineSuccess<CCState> {
  const p = s.players.find((x) => x.id === playerId);
  if (p) {
    p.connected = connected;
    p.disconnectedAt = connected ? null : ctx.now;
  }
  return { ok: true, state: s, stateChanged: !!p, messages: [] };
}

function removePlayer(s: CCState, playerId: string, ctx: EngineContext): EngineSuccess<CCState> {
  const idx = s.players.findIndex((x) => x.id === playerId);
  const p = s.players[idx];
  if (!p || p.left || s.status !== "playing") return { ok: true, state: s, stateChanged: false, messages: [] };
  const log: CCPublicAction[] = [{ kind: "left", playerId }];
  p.left = true;
  p.connected = false;
  // Their cards go back into the draw pile so the deck stays complete.
  s.drawPile.push(...p.hand);
  shuffle(s.drawPile, ctx.rng);
  p.hand = [];

  const remaining = s.players.filter((x) => !x.left);
  if (remaining.length < 2) {
    finish(s, remaining[0]?.id ?? null, "players-left", ctx.now, log);
  } else if (idx === s.current) {
    s.pendingDraw = 0;
    startTurn(s, seatAfter(s, idx, 1), ctx.now);
  }
  return done(s, log);
}

function viewFor(s: CCState, viewerId: string): CCView {
  const current = s.players[s.current]!;
  const me = s.players.find((p) => p.id === viewerId && !p.left);
  let you: CCView["you"] = null;
  if (me) {
    const isTurn = s.status === "playing" && current.id === me.id;
    let playableIds: string[] = [];
    if (isTurn) {
      const ctx = playContext(s, me.hand);
      playableIds = (s.drawnCardId ? me.hand.filter((c) => c.id === s.drawnCardId) : me.hand)
        .filter((c) => canPlay(c, ctx))
        .map((c) => c.id);
    }
    you = {
      id: me.id,
      hand: [...me.hand].sort(compareCards),
      playableIds,
      drawnCardId: isTurn ? s.drawnCardId : null,
      isTurn,
    };
  }
  return {
    status: s.status,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      cardCount: p.hand.length,
      connected: p.connected,
      left: p.left,
    })),
    currentPlayerId: current.id,
    direction: s.direction,
    topCard: s.discard[s.discard.length - 1]!,
    activeColor: s.activeColor,
    drawPileCount: s.drawPile.length,
    discardCount: s.discard.length,
    pendingDraw: s.pendingDraw,
    turnStartedAt: s.turnStartedAt,
    turnDeadline: nextDeadline(s),
    turnNumber: s.turnNumber,
    winnerId: s.winnerId,
    config: s.config,
    you,
  };
}

function results(s: CCState): MatchResults {
  const scored = scoreMatch(
    s.players.map((p) => ({ id: p.id, hand: p.hand, left: p.left })),
    s.winnerId,
    DEFAULT_SCORING,
  );
  return {
    gameId: "color-clash",
    endedAt: s.endedAt ?? Date.now(),
    reason: s.endReason ?? "aborted",
    entries: scored.map((e) => {
      const p = s.players.find((x) => x.id === e.id)!;
      return {
        playerId: p.id,
        name: p.name,
        color: p.color,
        placement: e.placement,
        score: e.score,
        isWinner: p.id === s.winnerId,
        details: { cardsLeft: e.cardsLeft, handPoints: e.handPoints },
      };
    }),
  };
}

export const colorClashEngine: GameEngine<CCState, ColorClashConfig, ColorClashAction, CCView> = {
  id: "color-clash",
  minPlayers: 2,
  maxPlayers: 4,
  configSchema: colorClashConfigSchema,
  defaultConfig: () => colorClashConfigSchema.parse({}),
  actionSchema: colorClashActionSchema,
  actionTypes: ["card:play", "card:draw", "card:pass"],
  requiresVersion: () => true,
  create,
  handleAction,
  tick,
  nextDeadline,
  viewFor,
  syncMessages: () => [],
  setConnected,
  removePlayer,
  isFinished: (s) => s.status === "finished",
  results,
};

"use client";

import Link from "next/link";
import { getGame, type GameId } from "@platform/shared";
import { ChefCharacter } from "../chef-rivals/chef";
import "../chef-rivals/chef-rivals.css";

interface Mode { id: GameId; title: string; blurb: string; nature: string; difficulty: string; reward: string; matchmaking: boolean; here?: boolean }
/** Only modes that are really playable belong here. */
const GROUPS: { title: string; modes: Mode[] }[] = [
  { title: "Play solo", modes: [
    { id: "cuisine-quest", title: "Chef's Journey", blurb: "Seven kitchens, 28 recipes, 21 stars and 21 seals.", nature: "Solo campaign", difficulty: "Easy to master", reward: "Stars, rank, Sin Coins", matchmaking: false, here: true },
    { id: "kitchen-rush", title: "Kitchen Rush", blurb: "Twelve fast shifts in a busy diner.", nature: "Solo arcade", difficulty: "Builds up quickly", reward: "Stars, Sin Coins", matchmaking: false },
  ] },
  { title: "Compete", modes: [
    { id: "chef-rivals", title: "Chef Rivals", blurb: "Same mystery basket, same clock, then the judges decide.", nature: "Head to head", difficulty: "Skill-based", reward: "Win record, Sin Coins", matchmaking: true },
  ] },
  { title: "Play together", modes: [
    { id: "kitchen-rush-coop", title: "Kitchen Rush Co-op", blurb: "Share one kitchen through seven restaurants.", nature: "Team co-op", difficulty: "Chaotic, gets harder", reward: "Team stars, Sin Coins", matchmaking: true },
  ] },
];
const CHEF_COLORS = ["#ff6b4a", "#7c5cff", "#2fd6a8", "#ffb23d"];

export function CuisineModes() {
  return (
    <nav className="cq-modes" aria-label="Ways to play" data-testid="cq-modes">
      {GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          {group.modes.map((mode) => {
            const game = getGame(mode.id);
            const players = game.minPlayers === game.maxPlayers ? (game.minPlayers === 1 ? "1 player" : `${game.minPlayers} players`) : `${game.minPlayers}–${game.maxPlayers} players`;
            const body = <>
              <span className="cq-mode-chefs" aria-hidden>{Array.from({ length: Math.min(game.maxPlayers, 4) }, (_, i) => <ChefCharacter key={i} id={`${mode.id}-${i}`} color={CHEF_COLORS[i]!} />)}</span>
              <strong>{mode.title}</strong><span>{mode.blurb}</span>
              <dl>
                <div><dt>Players</dt><dd>{players}</dd></div><div><dt>Type</dt><dd>{mode.nature}</dd></div>
                <div><dt>Length</dt><dd>{game.avgDurationMinutes[0]}–{game.avgDurationMinutes[1]} min</dd></div><div><dt>Challenge</dt><dd>{mode.difficulty}</dd></div>
                <div><dt>Rewards</dt><dd>{mode.reward}</dd></div><div><dt>Join by</dt><dd>{game.kind === "solo" ? "Start any time" : mode.matchmaking ? "Room code or matchmaking" : "Room code"}</dd></div>
              </dl>
            </>;
            return mode.here
              ? <div key={mode.id} className="cq-mode cq-mode-here" aria-current="page" data-testid={`cq-mode-${mode.id}`}><em>You are here</em>{body}</div>
              : <Link key={mode.id} href={`/play/${game.slug}`} className="cq-mode" data-testid={`cq-mode-${mode.id}`}>{body}</Link>;
          })}
        </section>
      ))}
    </nav>
  );
}

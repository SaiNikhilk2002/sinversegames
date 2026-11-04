import { Award, Brush, ChefHat, Compass, Crown, Flag, Layers, Sparkles, Trophy } from "lucide-react";

export function AchievementEmblem({ achievementKey, earned }: { achievementKey: string; earned: boolean }) {
  const Icon = achievementKey === "cq-world-chef" ? Compass : achievementKey.includes("chef") || achievementKey.startsWith("cq-") ? ChefHat : achievementKey.includes("doodle") || achievementKey.includes("sketch") ? Brush : achievementKey.includes("clash") || achievementKey === "big-hand" ? Layers : achievementKey.includes("trail") ? Flag : achievementKey === "regular" ? Crown : achievementKey === "first-match" ? Sparkles : achievementKey === "first-win" ? Trophy : Award;
  return <Icon className="size-5" aria-label={earned ? "Earned badge" : "Badge not earned"} />;
}

export const achievementTier = (key: string) => key.startsWith("cq-master-") || key === "cq-world-chef" || key === "master-chef" || key === "master-sketcher" || key === "pagoda-master" ? "Mastery" : key === "cq-perfect-shift" || key === "cq-speed-chef" || key.includes("champion") || key === "regular" || key === "trail-boss" || key === "doodle-star" ? "Skilled" : "Milestone";

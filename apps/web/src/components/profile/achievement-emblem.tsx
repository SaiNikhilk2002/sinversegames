import { Award, Brush, ChefHat, Crown, Flag, Layers, Sparkles, Trophy } from "lucide-react";

export function AchievementEmblem({ achievementKey, earned }: { achievementKey: string; earned: boolean }) {
  const Icon = achievementKey.includes("chef") ? ChefHat : achievementKey.includes("doodle") || achievementKey.includes("sketch") ? Brush : achievementKey.includes("clash") || achievementKey === "big-hand" ? Layers : achievementKey.includes("trail") ? Flag : achievementKey === "regular" ? Crown : achievementKey === "first-match" ? Sparkles : achievementKey === "first-win" ? Trophy : Award;
  return <Icon className="size-5" aria-label={earned ? "Earned badge" : "Badge not earned"} />;
}

export const achievementTier = (key: string) => key === "master-chef" || key === "master-sketcher" || key === "pagoda-master" ? "Mastery" : key.includes("champion") || key === "regular" || key === "trail-boss" || key === "doodle-star" ? "Skilled" : "Milestone";

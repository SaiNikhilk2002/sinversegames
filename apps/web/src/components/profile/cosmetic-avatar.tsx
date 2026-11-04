import { getCosmetic } from "@platform/shared";
import { Avatar } from "../ui/primitives";

export function CosmeticAvatar({ name, color, frameId, size = 40 }: { name: string; color: string; frameId?: string | null; size?: number }) {
  const frame = getCosmetic(frameId);
  return (
    <span data-testid="cosmetic-avatar" data-frame={frame?.category === "profile-frame" ? frame.id : "default"} className="inline-flex shrink-0 rounded-full p-1" style={frame?.category === "profile-frame" ? { border: `4px ${frame.detail} ${frame.color}`, boxShadow: `0 0 0 2px var(--bg)` } : { border: "4px solid transparent" }}>
      <Avatar name={name} color={color} size={size} />
    </span>
  );
}

"use client";
import { useState } from "react";
import { avatarUrl } from "@platform/shared";
export function PlayerAvatar({
  name,
  color,
  size = 40,
  className,
  ring,
  avatarKey,
}: {
  name: string;
  color: string;
  size?: number;
  className?: string;
  ring?: boolean;
  avatarKey?: string | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = avatarUrl(avatarKey, size > 64 ? "full" : "small");
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-bold text-[#17142b] ${ring ? "ring-4 ring-brand-400/70" : ""} ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.38,
      }}
    >
      {initials}
      {url && failed !== url && (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(url)}
        />
      )}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { realtime } from "./connection";

/** Milliseconds until a server-clock deadline, re-rendering a few times per second. */
export function useCountdown(deadline: number | null | undefined, intervalMs = 250): number | null {
  const [now, setNow] = useState(() => realtime.serverNow());
  useEffect(() => {
    if (!deadline) return;
    setNow(realtime.serverNow());
    const t = setInterval(() => setNow(realtime.serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [deadline, intervalMs]);
  return deadline ? Math.max(0, deadline - now) : null;
}

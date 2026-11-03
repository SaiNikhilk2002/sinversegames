"use client";

import { MotionConfig } from "motion/react";
import { useSettings } from "@/lib/settings";

/**
 * Applies reduced motion to every `motion` animation: always when the in-app
 * "Reduce motion" setting is on, otherwise following the OS preference.
 * Reduced motion keeps fades but drops movement and scaling.
 */
export function MotionSettings({ children }: { children: React.ReactNode }) {
  const { reducedMotion } = useSettings();
  return <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>{children}</MotionConfig>;
}

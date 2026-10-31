/**
 * Minimal structured JSON logger. Callers must never pass secret words, hands,
 * tokens or chat content as fields — log ids and counts instead.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  readonly errorCount: number;
}

export function createLogger(level: LogLevel = "info"): Logger {
  const min = LEVELS[level];
  let errorCount = 0;
  const write = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (lvl === "error") errorCount++;
    if (LEVELS[lvl] < min) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...fields });
    (lvl === "error" || lvl === "warn" ? process.stderr : process.stdout).write(line + "\n");
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    get errorCount() {
      return errorCount;
    },
  };
}

export const errorFields = (err: unknown) =>
  err instanceof Error ? { error: err.message, stack: err.stack?.split("\n").slice(0, 4).join(" | ") } : { error: String(err) };

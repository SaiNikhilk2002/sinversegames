import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(4200),
  HOST: z.string().default("0.0.0.0"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  ADMIN_TOKEN: z.string().min(16).optional(),
  /** Origins allowed to open sockets (the web app's URL). */
  ALLOWED_ORIGINS: csv,
  DATABASE_URL: z.string().optional(),
  /** How long a disconnected player keeps their seat. */
  RECONNECT_GRACE_MS: z.coerce.number().int().min(5_000).default(60_000),
  /** Lobbies and finished rooms with no activity for this long are closed. */
  ROOM_IDLE_MS: z.coerce.number().int().min(60_000).default(30 * 60_000),
  /** Rooms nobody is connected to are removed after this long. */
  EMPTY_ROOM_TTL_MS: z.coerce.number().int().min(1_000).default(60_000),
  MATCHMAKING_WAIT_MS: z.coerce.number().int().min(1_000).default(8_000),
  MAX_ROOMS: z.coerce.number().int().default(5_000),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().default(30),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type RealtimeConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RealtimeConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid realtime server configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.ALLOWED_ORIGINS.length === 0) {
    throw new Error("ALLOWED_ORIGINS must be set in production");
  }
  return parsed.data;
}

export const testConfig = (overrides: Partial<RealtimeConfig> = {}): RealtimeConfig => ({
  ...schema.parse({ NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret-000", LOG_LEVEL: "error" }),
  ...overrides,
});

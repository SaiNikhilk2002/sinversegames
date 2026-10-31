import { loadConfig } from "./config";
import { createLogger, errorFields } from "./logger";
import { createDbPersistence } from "./persistence";
import { createRealtimeServer } from "./server";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const server = createRealtimeServer({ config, logger, persistence: createDbPersistence(logger) });

const port = await server.listen();
logger.info("realtime server listening", { port, origins: config.ALLOWED_ORIGINS, env: config.NODE_ENV });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  // Active matches live in memory: clients are told the server restarted
  // ("room:closed" / "shutdown") so they can show a clear message.
  logger.warn("shutting down", { signal, rooms: server.manager.rooms.size });
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  await server.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (e) => logger.error("unhandled rejection", errorFields(e)));
process.on("uncaughtException", (e) => logger.error("uncaught exception", errorFields(e)));

// Starts a local PostgreSQL server for development without Docker, using the
// embedded-postgres binaries. Data persists in <repo>/.data/postgres.
//
//   pnpm db:local            # start (keep this terminal open)
//
// Connection URL (put in .env): postgresql://platform:platform@localhost:5433/platform
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(import.meta.dirname, "../../..");
const dataDir = path.join(root, ".data", "postgres");
const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const database = "platform";

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "platform",
  password: "platform",
  port,
  persistent: true,
  onLog: () => {},
  onError: (message) => console.error(String(message).trim()),
});

const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
if (fresh) {
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  console.log(`Initialising local PostgreSQL in ${dataDir} …`);
  await pg.initialise();
}
await pg.start();
if (fresh) await pg.createDatabase(database);

console.log(`\nLocal PostgreSQL running on port ${port}`);
console.log(`DATABASE_URL=postgresql://platform:platform@localhost:${port}/${database}\n`);
console.log("Press Ctrl+C to stop.");

const shutdown = async () => {
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);

import { app } from "./app.js";
import { env } from "./config/env.js";
import { initializeDatabase } from "./db/init.js";

async function bootstrap(): Promise<void> {
  await initializeDatabase();
  app.listen(env.PORT, () => {
    console.log(`[backend] listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown bootstrap error";
  console.error(`[backend] failed to start: ${message}`);
  process.exit(1);
});

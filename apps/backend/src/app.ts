import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { lyricsRouter } from "./modules/lyrics/lyrics.routes.js";
import { spotifyRouter } from "./modules/spotify/spotify.routes.js";

export const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === env.CORS_ORIGIN) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    }
  })
);
app.use(helmet());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "lyribolsa-backend",
    timestamp: new Date().toISOString()
  });
});

app.use("/v1/auth", authRouter);
app.use("/v1/spotify", spotifyRouter);
app.use("/v1/lyrics", lyricsRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  res.status(400).json({
    error: message
  });
});

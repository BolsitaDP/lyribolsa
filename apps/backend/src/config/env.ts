import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const backendRootPath = path.resolve(currentDirPath, "../..");

loadDotenv({ path: path.resolve(backendRootPath, ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/lyribolsa"),
  SPOTIFY_CLIENT_ID: z.string().default(""),
  SPOTIFY_CLIENT_SECRET: z.string().default(""),
  SPOTIFY_REDIRECT_URI: z.string().default("http://127.0.0.1:4000/v1/auth/spotify/callback"),
  SPOTIFY_SCOPES: z.string().default("user-read-currently-playing user-read-playback-state")
});

export const env = envSchema.parse(process.env);

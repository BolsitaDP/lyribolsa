import { Router } from "express";
import { z } from "zod";
import { LyricsService } from "./lyrics.service.js";
import { LrcLibProvider } from "./providers/lrclib.provider.js";

const resolveSchema = z.object({
  track: z.object({
    spotifyTrackId: z.string(),
    trackName: z.string(),
    artistName: z.string(),
    albumName: z.string().nullable(),
    durationMs: z.number(),
    isrc: z.string().nullable(),
    progressMs: z.number(),
    artworkUrl: z.string().nullable(),
    isPlaying: z.boolean()
  })
});

const service = new LyricsService(new LrcLibProvider());

export const lyricsRouter = Router();

lyricsRouter.post("/resolve", async (req, res, next) => {
  try {
    const parsed = resolveSchema.parse(req.body);
    const response = await service.resolveLyrics(parsed);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

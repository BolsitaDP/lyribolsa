import { Router } from "express";
import type { TrackPlaybackDto } from "@lyribolsa/contracts";
import { getSessionById, markSessionConnected, markSessionError } from "../auth/auth.store.js";
import { saveSpotifyConnection } from "../auth/auth.repository.js";
import { fetchSpotifyCurrentPlayback, refreshSpotifyAccessToken } from "./spotify.client.js";

export const spotifyRouter = Router();

async function ensureValidAccessToken(sessionId: string): Promise<string> {
  const session = getSessionById(sessionId);
  if (!session || !session.spotify) {
    throw new Error("Session is not connected to Spotify.");
  }

  const expirationBufferMs = 30 * 1000;
  if (session.spotify.expiresAt > Date.now() + expirationBufferMs) {
    return session.spotify.accessToken;
  }

  const refreshed = await refreshSpotifyAccessToken(session.spotify.refreshToken);
  const updatedSession = markSessionConnected(sessionId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? session.spotify.refreshToken,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
    spotifyUserId: session.spotify.spotifyUserId
  });

  if (updatedSession?.spotify) {
    await saveSpotifyConnection(updatedSession.appUserId, updatedSession.spotify);
  }

  return refreshed.access_token;
}

spotifyRouter.get("/current-track", async (req, res) => {
  const sessionId = String(req.query.sessionId || "");
  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId" });
    return;
  }

  const session = getSessionById(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!session.spotify) {
    res.status(401).json({ error: "Session is not connected to Spotify." });
    return;
  }

  try {
    const accessToken = await ensureValidAccessToken(sessionId);
    const playback = await fetchSpotifyCurrentPlayback(accessToken);

    if (!playback || !playback.item || playback.currently_playing_type !== "track") {
      res.json({
        track: null
      });
      return;
    }

    const mappedTrack: TrackPlaybackDto = {
      spotifyTrackId: playback.item.id,
      trackName: playback.item.name,
      artistName: playback.item.artists.map((artist) => artist.name).join(", "),
      albumName: playback.item.album.name ?? null,
      durationMs: playback.item.duration_ms,
      isrc: playback.item.external_ids?.isrc ?? null,
      progressMs: playback.progress_ms ?? 0,
      artworkUrl: playback.item.album.images?.[0]?.url ?? null,
      isPlaying: playback.is_playing
    };

    res.json({
      track: mappedTrack
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Spotify playback error";
    markSessionError(sessionId, message);
    res.status(502).json({
      error: message
    });
  }
});

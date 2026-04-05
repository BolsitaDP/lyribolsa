import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../../config/env.js";
import {
  consumeOAuthState,
  createOAuthStateForSession,
  createSession,
  getSessionById,
  markSessionConnected,
  markSessionError
} from "./auth.store.js";
import { exchangeAuthorizationCode, fetchSpotifyProfile } from "../spotify/spotify.client.js";
import { ensureAppUserExists, findSpotifyConnectionByAppUserId, saveSpotifyConnection } from "./auth.repository.js";

export const authRouter = Router();

const createSessionSchema = z.object({
  desktopClientId: z.string().uuid().optional()
});

authRouter.post("/session", async (req, res, next) => {
  try {
    const parsed = createSessionSchema.parse(req.body ?? {});
    const appUserId = parsed.desktopClientId ?? randomUUID();

    await ensureAppUserExists(appUserId);
    const existingSpotifyConnection = await findSpotifyConnectionByAppUserId(appUserId);

    const session = createSession({
      appUserId,
      spotify: existingSpotifyConnection
    });

    res.status(201).json({
      sessionId: session.id,
      appUserId: session.appUserId,
      status: session.status,
      connected: session.status === "connected",
      spotifyUserId: session.spotify?.spotifyUserId ?? null,
      createdAt: session.createdAt
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/spotify/start", (req, res) => {
  const sessionId = String(req.query.sessionId || "");
  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId" });
    return;
  }

  if (!getSessionById(sessionId)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    res.status(500).json({ error: "Spotify credentials are not configured on backend." });
    return;
  }

  const state = createOAuthStateForSession(sessionId);
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const authorizeParams = new URLSearchParams({
    client_id: env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: env.SPOTIFY_REDIRECT_URI,
    scope: env.SPOTIFY_SCOPES,
    state
  });

  res.redirect(`https://accounts.spotify.com/authorize?${authorizeParams.toString()}`);
});

authRouter.get("/spotify/callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const authError = String(req.query.error || "");

  if (!state) {
    res.status(400).send("<h3>Missing OAuth state. Close this window and try again.</h3>");
    return;
  }

  const sessionId = consumeOAuthState(state);
  if (!sessionId) {
    res.status(400).send("<h3>Invalid or expired OAuth state. Close this window and retry login.</h3>");
    return;
  }

  if (authError) {
    markSessionError(sessionId, `Spotify auth error: ${authError}`);
    res.status(400).send("<h3>Spotify login was canceled or failed. You can close this window.</h3>");
    return;
  }

  if (!code) {
    markSessionError(sessionId, "Spotify did not return an authorization code.");
    res.status(400).send("<h3>Missing authorization code. Close this window and retry.</h3>");
    return;
  }

  try {
    const tokenResponse = await exchangeAuthorizationCode(code);
    const profile = await fetchSpotifyProfile(tokenResponse.access_token);
    const refreshToken = tokenResponse.refresh_token ?? null;

    if (!refreshToken) {
      markSessionError(sessionId, "Spotify did not return a refresh token.");
      res.status(500).send("<h3>Missing refresh token. Close this window and try again.</h3>");
      return;
    }

    const updatedSession = markSessionConnected(sessionId, {
      accessToken: tokenResponse.access_token,
      refreshToken,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      spotifyUserId: profile.id
    });

    if (!updatedSession) {
      res.status(404).send("<h3>Session not found after callback. Please retry login.</h3>");
      return;
    }

    await saveSpotifyConnection(updatedSession.appUserId, updatedSession.spotify!);

    res
      .status(200)
      .send(
        "<h3>Spotify connected successfully.</h3><p>You can close this window and return to Lyribolsa.</p>"
      );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Spotify callback error";
    markSessionError(sessionId, errorMessage);
    res.status(500).send(`<h3>Spotify connection failed.</h3><p>${errorMessage}</p>`);
  }
});

authRouter.get("/session/:sessionId", (req, res) => {
  const session = getSessionById(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({
    sessionId: session.id,
    appUserId: session.appUserId,
    status: session.status,
    connected: session.status === "connected",
    spotifyUserId: session.spotify?.spotifyUserId ?? null,
    error: session.error,
    updatedAt: session.updatedAt
  });
});

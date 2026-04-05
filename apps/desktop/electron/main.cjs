const { app, BrowserWindow, ipcMain, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const dotenv = require("dotenv");
const ElectronStore = require("electron-store");
const Store = ElectronStore.default || ElectronStore;

function loadEnvironment() {
  const candidates = [
    path.resolve(__dirname, "..", ".env"),
    path.resolve(process.cwd(), "apps", "desktop", ".env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.resourcesPath || "", ".env"),
    path.resolve(path.dirname(process.execPath), ".env")
  ];

  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) {
      continue;
    }
    dotenv.config({
      path: candidate,
      override: false
    });
    break;
  }
}

loadEnvironment();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_SCOPES = process.env.SPOTIFY_SCOPES || "user-read-currently-playing user-read-playback-state";
const SPOTIFY_REDIRECT_PORT = Number(process.env.SPOTIFY_REDIRECT_PORT || 45879);
const SPOTIFY_REDIRECT_URI = `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}/spotify/callback`;
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000;
const OAUTH_TIMEOUT_MS = 120 * 1000;
const LYRICS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LYRICS_CACHE_ENTRIES = 5000;

const store = new Store({
  name: "preferences",
  defaults: {
    overlayPreferences: {
      mode: "edit",
      backgroundOpacity: 0.2,
      textOpacity: 1,
      fontSize: 28,
      alwaysOnTop: true
    },
    overlayBounds: {
      width: 720,
      height: 300
    },
    auth: {
      desktopClientId: crypto.randomUUID(),
      connection: null,
      lastError: null,
      updatedAt: new Date().toISOString()
    },
    lyricsCache: {}
  }
});

const runtimeState = {
  lyricsCacheDirty: false
};

function getAuthState() {
  return store.get("auth");
}

function setAuthState(nextState) {
  store.set("auth", {
    ...nextState,
    updatedAt: new Date().toISOString()
  });
}

function setAuthError(message) {
  const authState = getAuthState();
  setAuthState({
    ...authState,
    lastError: message
  });
}

function setSpotifyConnection(connection) {
  const authState = getAuthState();
  setAuthState({
    ...authState,
    connection,
    lastError: null
  });
}

function clearSpotifyConnection() {
  const authState = getAuthState();
  setAuthState({
    ...authState,
    connection: null,
    lastError: null
  });
}

function getAuthStatusDto() {
  const authState = getAuthState();
  const connection = authState.connection;
  const connected = Boolean(connection);
  return {
    sessionId: authState.desktopClientId,
    appUserId: authState.desktopClientId,
    status: authState.lastError ? "error" : connected ? "connected" : "pending",
    connected,
    spotifyUserId: connection?.spotifyUserId ?? null,
    spotifyDisplayName: connection?.spotifyDisplayName ?? null,
    spotifyAvatarUrl: connection?.spotifyAvatarUrl ?? null,
    error: authState.lastError ?? null,
    updatedAt: authState.updatedAt
  };
}

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair() {
  const codeVerifier = base64Url(crypto.randomBytes(64));
  const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function waitForSpotifyAuthCallback(expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}`);
      if (requestUrl.pathname !== "/spotify/callback") {
        response.statusCode = 404;
        response.end("Not Found");
        return;
      }

      const receivedError = requestUrl.searchParams.get("error");
      const receivedState = requestUrl.searchParams.get("state");
      const receivedCode = requestUrl.searchParams.get("code");

      if (receivedError) {
        response.end("<h3>Spotify authorization failed.</h3><p>You can close this tab.</p>");
        server.close();
        reject(new Error(`Spotify authorization failed: ${receivedError}`));
        return;
      }

      if (!receivedCode || !receivedState) {
        response.end("<h3>Invalid Spotify callback.</h3><p>You can close this tab and retry.</p>");
        server.close();
        reject(new Error("Invalid Spotify callback payload."));
        return;
      }

      if (receivedState !== expectedState) {
        response.end("<h3>State mismatch.</h3><p>You can close this tab and retry login.</p>");
        server.close();
        reject(new Error("Spotify callback state mismatch."));
        return;
      }

      response.end("<h3>Spotify connected.</h3><p>You can close this tab and return to Lyribolsa.</p>");
      server.close();
      resolve(receivedCode);
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Spotify login timed out. Please try again."));
    }, OAUTH_TIMEOUT_MS);

    server.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    server.once("close", () => {
      clearTimeout(timeout);
    });

    server.listen(SPOTIFY_REDIRECT_PORT, "127.0.0.1");
  });
}

async function exchangeSpotifyToken(params) {
  const searchParams = new URLSearchParams(params);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: searchParams.toString()
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Spotify token request failed (${response.status}): ${message}`);
  }

  return response.json();
}

async function fetchSpotifyProfile(accessToken) {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Spotify profile request failed (${response.status}): ${message}`);
  }

  return response.json();
}

async function connectSpotifyEmbedded() {
  if (!SPOTIFY_CLIENT_ID) {
    throw new Error("Missing SPOTIFY_CLIENT_ID. Define it in desktop .env before packaging/running.");
  }

  const state = crypto.randomUUID();
  const pkce = createPkcePair();
  const authorizeParams = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: pkce.codeChallenge
  });

  const callbackCodePromise = waitForSpotifyAuthCallback(state);
  await shell.openExternal(`https://accounts.spotify.com/authorize?${authorizeParams.toString()}`);
  const authorizationCode = await callbackCodePromise;

  const tokenResponse = await exchangeSpotifyToken({
    grant_type: "authorization_code",
    code: authorizationCode,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: pkce.codeVerifier
  });

  const profile = await fetchSpotifyProfile(tokenResponse.access_token);
  const previousConnection = getAuthState().connection;

  const refreshToken = tokenResponse.refresh_token || previousConnection?.refreshToken || null;
  if (!refreshToken) {
    throw new Error("Spotify did not return a refresh token.");
  }

  setSpotifyConnection({
    accessToken: tokenResponse.access_token,
    refreshToken,
    expiresAtMs: Date.now() + tokenResponse.expires_in * 1000,
    spotifyUserId: profile.id,
    spotifyDisplayName: profile.display_name ?? profile.id,
    spotifyAvatarUrl: Array.isArray(profile.images) ? profile.images[0]?.url ?? null : null
  });
}

async function ensureSpotifyAccessToken() {
  const connection = getAuthState().connection;
  if (!connection) {
    throw new Error("Spotify is not connected.");
  }

  if (connection.expiresAtMs > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    throw new Error("Missing Spotify refresh token.");
  }

  const refreshResponse = await exchangeSpotifyToken({
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken,
    client_id: SPOTIFY_CLIENT_ID
  });

  const nextConnection = {
    ...connection,
    accessToken: refreshResponse.access_token,
    refreshToken: refreshResponse.refresh_token || connection.refreshToken,
    expiresAtMs: Date.now() + refreshResponse.expires_in * 1000
  };
  setSpotifyConnection(nextConnection);
  return nextConnection.accessToken;
}

async function fetchSpotifyCurrentTrack() {
  const accessToken = await ensureSpotifyAccessToken();

  let response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 401) {
    const refreshedToken = await ensureSpotifyAccessToken();
    response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: {
        Authorization: `Bearer ${refreshedToken}`
      }
    });
  }

  if (response.status === 204) {
    return { track: null };
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Spotify currently-playing failed (${response.status}): ${message}`);
  }

  const playback = await response.json();
  const trackItem = playback?.item;
  if (!trackItem || playback.currently_playing_type !== "track") {
    return { track: null };
  }

  return {
    track: {
      spotifyTrackId: trackItem.id,
      trackName: trackItem.name,
      artistName: Array.isArray(trackItem.artists) ? trackItem.artists.map((artist) => artist.name).join(", ") : "",
      albumName: trackItem.album?.name ?? null,
      durationMs: trackItem.duration_ms ?? 0,
      isrc: trackItem.external_ids?.isrc ?? null,
      progressMs: playback.progress_ms ?? 0,
      artworkUrl: trackItem.album?.images?.[0]?.url ?? null,
      isPlaying: Boolean(playback.is_playing)
    }
  };
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/\(.*?(feat|ft|live|remaster|version|explicit).*?\)/gi, "")
    .replace(/\b(feat|ft)\.?\s+.+$/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSyncedLyrics(syncedText) {
  if (!syncedText || typeof syncedText !== "string") {
    return [];
  }

  const parsedLines = [];
  const lines = syncedText.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/);
    if (!match) {
      continue;
    }
    const minutes = Number(match[1] || "0");
    const seconds = Number(match[2] || "0");
    const fractionRaw = match[3] || "0";
    const fractionMs =
      fractionRaw.length === 3 ? Number(fractionRaw) : fractionRaw.length === 2 ? Number(fractionRaw) * 10 : 0;
    const text = (match[4] || "").trim();
    if (!text) {
      continue;
    }
    parsedLines.push({
      timeMs: minutes * 60000 + seconds * 1000 + fractionMs,
      text
    });
  }
  parsedLines.sort((a, b) => a.timeMs - b.timeMs);
  return parsedLines;
}

function getLyricsCache() {
  return store.get("lyricsCache") || {};
}

function persistLyricsCache(cache) {
  store.set("lyricsCache", cache);
  runtimeState.lyricsCacheDirty = false;
}

function buildLyricsCacheKeys(track) {
  const keys = [];
  if (track.isrc) {
    keys.push(`isrc:${track.isrc.toLowerCase()}`);
  }
  keys.push(`norm:${normalizeText(track.artistName)}::${normalizeText(track.trackName)}`);
  keys.push(
    `normdur:${normalizeText(track.artistName)}::${normalizeText(track.trackName)}::${Math.round(track.durationMs / 1000)}`
  );
  return keys;
}

function pruneLyricsCache(cache) {
  const entries = Object.entries(cache);
  if (entries.length <= MAX_LYRICS_CACHE_ENTRIES) {
    return cache;
  }
  entries.sort((a, b) => (a[1]?.storedAtMs ?? 0) - (b[1]?.storedAtMs ?? 0));
  const toDelete = entries.length - MAX_LYRICS_CACHE_ENTRIES;
  for (let i = 0; i < toDelete; i += 1) {
    delete cache[entries[i][0]];
  }
  return cache;
}

function mapLrcLibCandidate(candidate, track) {
  const plainLyrics = candidate?.plainLyrics ?? candidate?.lyrics ?? null;
  const syncedText = candidate?.syncedLyrics ?? null;
  const syncedLyrics = parseSyncedLyrics(syncedText);

  return {
    source: "lrclib",
    language: candidate?.language ?? null,
    plainLyrics,
    syncedLyrics: syncedLyrics.length ? syncedLyrics : null,
    hasSynced: syncedLyrics.length > 0,
    title: candidate?.trackName ?? candidate?.name ?? track.trackName,
    artist: candidate?.artistName ?? candidate?.artist ?? track.artistName,
    album: candidate?.albumName ?? candidate?.album ?? track.albumName,
    durationMs:
      typeof candidate?.duration === "number"
        ? Math.round(candidate.duration * 1000)
        : typeof candidate?.durationMs === "number"
          ? candidate.durationMs
          : track.durationMs,
    isrc: candidate?.isrc ?? track.isrc,
    matchConfidence: 0.7,
    fetchedAt: new Date().toISOString()
  };
}

function chooseBestLrcLibCandidate(candidates, track) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const normalizedTrackTitle = normalizeText(track.trackName);
  const normalizedTrackArtist = normalizeText(track.artistName);

  let best = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const title = normalizeText(candidate.trackName ?? candidate.name ?? "");
    const artist = normalizeText(candidate.artistName ?? candidate.artist ?? "");
    const durationSec = typeof candidate.duration === "number" ? candidate.duration : null;
    const durationDeltaMs = durationSec === null ? Infinity : Math.abs(durationSec * 1000 - track.durationMs);

    let score = 0;
    if (title === normalizedTrackTitle) {
      score += 0.55;
    }
    if (artist === normalizedTrackArtist) {
      score += 0.35;
    }
    if (durationDeltaMs <= 3000) {
      score += 0.1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best || candidates[0];
}

async function fetchLyricsFromLrcLib(track) {
  const durationSeconds = Math.round(track.durationMs / 1000);
  const getQuery = new URLSearchParams({
    track_name: track.trackName,
    artist_name: track.artistName,
    duration: String(durationSeconds)
  });
  if (track.albumName) {
    getQuery.set("album_name", track.albumName);
  }

  const directResponse = await fetch(`https://lrclib.net/api/get?${getQuery.toString()}`);
  if (directResponse.ok) {
    const payload = await directResponse.json();
    return mapLrcLibCandidate(payload, track);
  }

  const searchQuery = new URLSearchParams({
    q: `${track.trackName} ${track.artistName}`
  });
  const searchResponse = await fetch(`https://lrclib.net/api/search?${searchQuery.toString()}`);
  if (!searchResponse.ok) {
    return null;
  }

  const candidates = await searchResponse.json();
  const best = chooseBestLrcLibCandidate(candidates, track);
  if (!best) {
    return null;
  }
  return mapLrcLibCandidate(best, track);
}

async function resolveLyricsForTrack(track) {
  const cache = getLyricsCache();
  const keys = buildLyricsCacheKeys(track);
  const now = Date.now();

  for (const key of keys) {
    const cacheEntry = cache[key];
    if (!cacheEntry) {
      continue;
    }
    if (now - cacheEntry.storedAtMs > LYRICS_CACHE_TTL_MS) {
      delete cache[key];
      runtimeState.lyricsCacheDirty = true;
      continue;
    }
    return {
      track,
      lyrics: {
        ...cacheEntry.lyrics,
        source: "cache"
      }
    };
  }

  const fetchedLyrics = await fetchLyricsFromLrcLib(track);
  if (!fetchedLyrics) {
    if (runtimeState.lyricsCacheDirty) {
      persistLyricsCache(pruneLyricsCache(cache));
    }
    return {
      track,
      lyrics: null
    };
  }

  for (const key of keys) {
    cache[key] = {
      storedAtMs: now,
      lyrics: fetchedLyrics
    };
  }
  persistLyricsCache(pruneLyricsCache(cache));
  return {
    track,
    lyrics: fetchedLyrics
  };
}

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

let mainWindow = null;
let overlayWindow = null;

function normalizeOverlayPreferences(preferences) {
  const legacyOpacity = typeof preferences?.opacity === "number" ? preferences.opacity : undefined;
  const clampOpacity = (value, fallback) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return fallback;
    }
    return Math.max(0, Math.min(1, value));
  };
  return {
    mode: preferences?.mode === "present" ? "present" : "edit",
    backgroundOpacity: clampOpacity(
      typeof preferences?.backgroundOpacity === "number"
        ? preferences.backgroundOpacity
        : legacyOpacity !== undefined
          ? legacyOpacity
          : 0.2,
      0.2
    ),
    textOpacity: clampOpacity(
      typeof preferences?.textOpacity === "number"
        ? preferences.textOpacity
        : legacyOpacity !== undefined
          ? legacyOpacity
          : 1,
      1
    ),
    fontSize: typeof preferences?.fontSize === "number" ? preferences.fontSize : 28,
    alwaysOnTop: typeof preferences?.alwaysOnTop === "boolean" ? preferences.alwaysOnTop : true
  };
}

function getOverlayPreferences() {
  const normalized = normalizeOverlayPreferences(store.get("overlayPreferences"));
  store.set("overlayPreferences", normalized);
  return normalized;
}

function setOverlayPreferences(partial) {
  const current = getOverlayPreferences();
  const next = normalizeOverlayPreferences({ ...current, ...(partial || {}) });
  store.set("overlayPreferences", next);
  return next;
}

function applyOverlayWindowMode(preferences) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const isPresentMode = preferences.mode === "present";
  const shouldStayOnTop = isPresentMode ? true : Boolean(preferences.alwaysOnTop);

  overlayWindow.setAlwaysOnTop(shouldStayOnTop);
  if (isPresentMode) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    overlayWindow.setIgnoreMouseEvents(false);
  }
  overlayWindow.setMovable(!isPresentMode);
  overlayWindow.setResizable(!isPresentMode);

  if (isPresentMode) {
    overlayWindow.blur();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(`${devServerUrl}/main.html`);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "main.html"));
  }
}

function createOrFocusOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return;
  }

  const bounds = store.get("overlayBounds");
  const prefs = getOverlayPreferences();

  overlayWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: prefs.mode === "present" ? true : prefs.alwaysOnTop,
    resizable: prefs.mode === "present" ? false : true,
    movable: prefs.mode === "present" ? false : true,
    hasShadow: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.on("close", () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return;
    }
    store.set("overlayBounds", overlayWindow.getBounds());
  });

  if (isDev) {
    overlayWindow.loadURL(`${devServerUrl}/overlay.html`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, "..", "dist", "overlay.html"));
  }

  applyOverlayWindowMode(prefs);
}

app.whenReady().then(() => {
  createMainWindow();
  createOrFocusOverlayWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("overlay:create-or-focus", () => {
  createOrFocusOverlayWindow();
  return { ok: true };
});

ipcMain.handle("overlay:get-preferences", () => {
  return getOverlayPreferences();
});

ipcMain.handle("overlay:update-preferences", (_event, partialPreferences) => {
  const next = setOverlayPreferences(partialPreferences || {});
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    applyOverlayWindowMode(next);
    overlayWindow.webContents.send("overlay:preferences-updated", next);
  }
  return next;
});

ipcMain.handle("overlay:set-always-on-top", (_event, value) => {
  const next = setOverlayPreferences({ alwaysOnTop: Boolean(value) });
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    applyOverlayWindowMode(next);
    overlayWindow.webContents.send("overlay:preferences-updated", next);
  }
  return next;
});

ipcMain.handle("overlay:set-bounds", (_event, bounds) => {
  if (overlayWindow && !overlayWindow.isDestroyed() && bounds) {
    overlayWindow.setBounds(bounds);
    store.set("overlayBounds", overlayWindow.getBounds());
  }
  return store.get("overlayBounds");
});

ipcMain.handle("overlay:get-bounds", () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow.getBounds();
  }
  return store.get("overlayBounds");
});

ipcMain.handle("auth:get-status", () => {
  return getAuthStatusDto();
});

ipcMain.handle("auth:connect-spotify", async () => {
  try {
    await connectSpotifyEmbedded();
    return getAuthStatusDto();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify connection failed.";
    setAuthError(message);
    return getAuthStatusDto();
  }
});

ipcMain.handle("auth:disconnect-spotify", () => {
  clearSpotifyConnection();
  return getAuthStatusDto();
});

ipcMain.handle("spotify:get-current-track", async () => {
  try {
    return await fetchSpotifyCurrentTrack();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch current track.";
    setAuthError(message);
    return { track: null };
  }
});

ipcMain.handle("lyrics:resolve-track", async (_event, track) => {
  if (!track || !track.spotifyTrackId || !track.trackName || !track.artistName) {
    return {
      track: track ?? null,
      lyrics: null
    };
  }

  try {
    return await resolveLyricsForTrack(track);
  } catch (_error) {
    return {
      track,
      lyrics: null
    };
  }
});

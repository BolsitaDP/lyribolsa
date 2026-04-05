import { randomUUID } from "node:crypto";

export type SessionStatus = "pending" | "connecting" | "connected" | "error";

export interface SpotifyConnection {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  spotifyUserId: string | null;
}

export interface DesktopSession {
  id: string;
  appUserId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  spotify: SpotifyConnection | null;
  error: string | null;
}

interface OAuthStateEntry {
  state: string;
  sessionId: string;
  createdAtMs: number;
}

const sessions = new Map<string, DesktopSession>();
const oauthStates = new Map<string, OAuthStateEntry>();

function nowIso(): string {
  return new Date().toISOString();
}

function updateSession(
  sessionId: string,
  updater: (current: DesktopSession) => DesktopSession
): DesktopSession | null {
  const current = sessions.get(sessionId);
  if (!current) {
    return null;
  }
  const next = updater(current);
  sessions.set(sessionId, next);
  return next;
}

function cleanExpiredOAuthStates(maxAgeMs = 10 * 60 * 1000): void {
  const now = Date.now();
  for (const [state, entry] of oauthStates.entries()) {
    if (now - entry.createdAtMs > maxAgeMs) {
      oauthStates.delete(state);
    }
  }
}

export function createSession(params: { appUserId: string; spotify: SpotifyConnection | null }): DesktopSession {
  const isConnected = Boolean(params.spotify);
  const session: DesktopSession = {
    id: randomUUID(),
    appUserId: params.appUserId,
    status: isConnected ? "connected" : "pending",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    spotify: params.spotify,
    error: null
  };
  sessions.set(session.id, session);
  return session;
}

export function getSessionById(sessionId: string): DesktopSession | null {
  return sessions.get(sessionId) ?? null;
}

export function markSessionConnecting(sessionId: string): DesktopSession | null {
  return updateSession(sessionId, (session) => ({
    ...session,
    status: "connecting",
    error: null,
    updatedAt: nowIso()
  }));
}

export function markSessionConnected(sessionId: string, spotify: SpotifyConnection): DesktopSession | null {
  return updateSession(sessionId, (session) => ({
    ...session,
    status: "connected",
    spotify,
    error: null,
    updatedAt: nowIso()
  }));
}

export function markSessionError(sessionId: string, errorMessage: string): DesktopSession | null {
  return updateSession(sessionId, (session) => ({
    ...session,
    status: "error",
    error: errorMessage,
    updatedAt: nowIso()
  }));
}

export function createOAuthStateForSession(sessionId: string): string | null {
  cleanExpiredOAuthStates();
  const session = markSessionConnecting(sessionId);
  if (!session) {
    return null;
  }
  const state = randomUUID();
  oauthStates.set(state, {
    state,
    sessionId,
    createdAtMs: Date.now()
  });
  return state;
}

export function consumeOAuthState(state: string): string | null {
  const entry = oauthStates.get(state);
  if (!entry) {
    return null;
  }
  oauthStates.delete(state);
  return entry.sessionId;
}

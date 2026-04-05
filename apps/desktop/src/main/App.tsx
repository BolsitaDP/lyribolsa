import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AuthSessionDto, CreateAuthSessionRequestDto, CurrentTrackResponseDto } from "@lyribolsa/contracts";
import axios from "axios";
import { apiClient } from "../api/client";
import { useOverlayPreferencesStore } from "../state/overlayPreferences";

function getOrCreateDesktopClientId(): string {
  const storageKey = "lyribolsa.desktopClientId";
  const existing = localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  localStorage.setItem(storageKey, created);
  return created;
}

export function App() {
  const preferences = useOverlayPreferencesStore((state) => state.preferences);
  const setPreferences = useOverlayPreferencesStore((state) => state.setPreferences);
  const [desktopClientId] = useState<string>(() => getOrCreateDesktopClientId());
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem("lyribolsa.sessionId"));

  useEffect(() => {
    window.lyribolsa.overlay.getPreferences().then(setPreferences).catch(console.error);
  }, [setPreferences]);

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const payload: CreateAuthSessionRequestDto = {
        desktopClientId
      };
      const response = await apiClient.post<AuthSessionDto>("/auth/session", payload);
      return response.data;
    }
  });

  useEffect(() => {
    if (sessionId || createSessionMutation.isPending) {
      return;
    }
    createSessionMutation
      .mutateAsync()
      .then((createdSession) => {
        setSessionId(createdSession.sessionId);
        localStorage.setItem("lyribolsa.sessionId", createdSession.sessionId);
        if (createdSession.appUserId) {
          localStorage.setItem("lyribolsa.desktopClientId", createdSession.appUserId);
        }
      })
      .catch(console.error);
  }, [createSessionMutation, desktopClientId, sessionId]);

  const authSessionQuery = useQuery({
    queryKey: ["auth-session", sessionId],
    queryFn: async () => {
      const response = await apiClient.get<AuthSessionDto>(`/auth/session/${sessionId}`);
      return response.data;
    },
    enabled: Boolean(sessionId),
    retry: (failureCount, error) => {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return false;
      }
      return failureCount < 2;
    },
    refetchInterval: (query) => (query.state.data?.connected ? 5000 : 2000)
  });

  useEffect(() => {
    const error = authSessionQuery.error;
    if (!error || !axios.isAxiosError(error)) {
      return;
    }
    if (error.response?.status !== 404) {
      return;
    }
    localStorage.removeItem("lyribolsa.sessionId");
    setSessionId(null);
  }, [authSessionQuery.error]);

  const currentTrackQuery = useQuery({
    queryKey: ["current-track", sessionId],
    queryFn: async () => {
      const response = await apiClient.get<CurrentTrackResponseDto>(`/spotify/current-track?sessionId=${sessionId}`);
      return response.data;
    },
    enabled: Boolean(sessionId && authSessionQuery.data?.connected),
    refetchInterval: 2500
  });

  const spotifyStartUrl = useMemo(() => {
    if (!sessionId) {
      return null;
    }
    return `http://127.0.0.1:4000/v1/auth/spotify/start?sessionId=${encodeURIComponent(sessionId)}`;
  }, [sessionId]);

  const authStatusLabel = authSessionQuery.data?.status ?? "pending";
  const track = currentTrackQuery.data?.track ?? null;

  const updatePreferences = async (partial: Partial<typeof preferences>) => {
    const next = await window.lyribolsa.overlay.updatePreferences(partial);
    setPreferences(next);
  };

  return (
    <main className="app-shell">
      <section className="card">
        <h1>Lyribolsa MVP</h1>
        <p>Desktop base scaffold: Spotify auth, backend API integration and floating lyrics overlay.</p>
        <div className="status-grid">
          <div className="status-item">
            <span>Session</span>
            <strong>{sessionId ?? "creating..."}</strong>
          </div>
          <div className="status-item">
            <span>Spotify status</span>
            <strong>{authStatusLabel}</strong>
          </div>
          <div className="status-item">
            <span>Spotify user</span>
            <strong>{authSessionQuery.data?.spotifyUserId ?? "-"}</strong>
          </div>
        </div>
        {authSessionQuery.data?.error ? <p className="error-text">Auth error: {authSessionQuery.data.error}</p> : null}
        <div className="track-box">
          <span>Current track</span>
          <strong>{track ? `${track.trackName} - ${track.artistName}` : "No active track detected"}</strong>
        </div>

        <div className="controls">
          <div className="control">
            <label htmlFor="opacity">Overlay opacity ({Math.round(preferences.opacity * 100)}%)</label>
            <input
              id="opacity"
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={preferences.opacity}
              onChange={(event) => {
                updatePreferences({ opacity: Number(event.target.value) }).catch(console.error);
              }}
            />
          </div>

          <div className="control">
            <label htmlFor="fontSize">Font size ({preferences.fontSize}px)</label>
            <input
              id="fontSize"
              type="range"
              min={16}
              max={56}
              step={1}
              value={preferences.fontSize}
              onChange={(event) => {
                updatePreferences({ fontSize: Number(event.target.value) }).catch(console.error);
              }}
            />
          </div>

          <div className="control">
            <label htmlFor="alwaysOnTop">Always on top</label>
            <input
              id="alwaysOnTop"
              type="checkbox"
              checked={preferences.alwaysOnTop}
              onChange={(event) => {
                window.lyribolsa.overlay
                  .setAlwaysOnTop(event.target.checked)
                  .then(setPreferences)
                  .catch(console.error);
              }}
            />
          </div>
        </div>

        <div className="actions">
          <button
            type="button"
            onClick={() => {
              window.lyribolsa.overlay.createOrFocus().catch(console.error);
            }}
          >
            Open overlay
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!spotifyStartUrl}
            onClick={() => {
              if (!spotifyStartUrl) {
                return;
              }
              window.lyribolsa.auth.openSpotifyLogin(spotifyStartUrl).catch(console.error);
            }}
          >
            Connect Spotify
          </button>
        </div>
      </section>
    </main>
  );
}

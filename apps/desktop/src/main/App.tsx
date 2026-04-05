import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useOverlayPreferencesStore } from "../state/overlayPreferences";

function formatMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function App() {
  const preferences = useOverlayPreferencesStore((state) => state.preferences);
  const setPreferences = useOverlayPreferencesStore((state) => state.setPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.lyribolsa.overlay.getPreferences().then(setPreferences).catch(console.error);
  }, [setPreferences]);

  const authSessionQuery = useQuery({
    queryKey: ["embedded-auth-status"],
    queryFn: async () => {
      return window.lyribolsa.auth.getStatus();
    },
    refetchInterval: 3000
  });

  const connectSpotifyMutation = useMutation({
    mutationFn: async () => {
      return window.lyribolsa.auth.connectSpotify();
    },
    onSuccess: () => {
      authSessionQuery.refetch().catch(console.error);
      currentTrackQuery.refetch().catch(console.error);
    }
  });

  const disconnectSpotifyMutation = useMutation({
    mutationFn: async () => {
      return window.lyribolsa.auth.disconnectSpotify();
    },
    onSuccess: () => {
      authSessionQuery.refetch().catch(console.error);
      currentTrackQuery.refetch().catch(console.error);
    }
  });

  const connected = Boolean(authSessionQuery.data?.connected);

  const currentTrackQuery = useQuery({
    queryKey: ["embedded-current-track"],
    queryFn: async () => {
      return window.lyribolsa.spotify.getCurrentTrack();
    },
    enabled: connected,
    refetchInterval: 2500
  });

  const lyricsQuery = useQuery({
    queryKey: ["embedded-lyrics", currentTrackQuery.data?.track?.spotifyTrackId],
    queryFn: async () => {
      if (!currentTrackQuery.data?.track) {
        return null;
      }
      return window.lyribolsa.lyrics.resolveTrack(currentTrackQuery.data.track);
    },
    enabled: Boolean(currentTrackQuery.data?.track?.spotifyTrackId),
    refetchInterval: 10000
  });

  const track = connected ? currentTrackQuery.data?.track ?? null : null;
  const lyrics = lyricsQuery.data?.lyrics ?? null;
  const isPresentMode = preferences.mode === "present";
  const profileName = authSessionQuery.data?.spotifyDisplayName ?? authSessionQuery.data?.spotifyUserId ?? "Spotify";
  const profileAvatar = authSessionQuery.data?.spotifyAvatarUrl ?? null;
  const progressRatio =
    track && track.durationMs > 0 ? Math.max(0, Math.min(100, (track.progressMs / track.durationMs) * 100)) : 0;

  const updatePreferences = async (partial: Partial<typeof preferences>) => {
    const next = await window.lyribolsa.overlay.updatePreferences(partial);
    setPreferences(next);
  };

  return (
    <main className="app-shell">
      <header className="main-topbar">
        <div className="brand-block">
          <h1>Lyribolsa</h1>
          <p>Desktop lyrics overlay</p>
        </div>

        <div className="topbar-right">
          <button type="button" className="settings-toggle" onClick={() => setSettingsOpen((current) => !current)}>
            Settings
          </button>

          <div className="profile-chip">
            {profileAvatar ? <img src={profileAvatar} alt="Spotify profile" className="profile-avatar" /> : <div className="profile-avatar-placeholder">S</div>}
            <div className="profile-meta">
              <span>{profileName}</span>
              <small>{connected ? "Connected" : "Disconnected"}</small>
            </div>
            <span className={connected ? "profile-status connected" : "profile-status disconnected"}>
              {connected ? "\u2713" : "!"}
            </span>
          </div>
        </div>
      </header>

      {settingsOpen ? (
        <section className="settings-panel">
          <div className="settings-row">
            <span>Session</span>
            <strong>{authSessionQuery.data?.sessionId ?? "-"}</strong>
          </div>
          <div className="settings-row">
            <span>Spotify user</span>
            <strong>{authSessionQuery.data?.spotifyUserId ?? "-"}</strong>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="settings-btn primary"
              disabled={connectSpotifyMutation.isPending}
              onClick={() => {
                connectSpotifyMutation.mutate();
              }}
            >
              Connect Spotify
            </button>
            <button
              type="button"
              className="settings-btn"
              disabled={!connected || disconnectSpotifyMutation.isPending}
              onClick={() => {
                disconnectSpotifyMutation.mutate();
              }}
            >
              Disconnect
            </button>
          </div>
          {authSessionQuery.data?.error ? <p className="settings-error">{authSessionQuery.data.error}</p> : null}
        </section>
      ) : null}

      <section className="home-grid">
        <article className="now-playing-card">
          <div className="now-playing-header">
            <span>Now Playing</span>
            <small>{lyrics ? (lyrics.hasSynced ? "Synced lyrics" : "Plain lyrics") : "No lyrics loaded"}</small>
          </div>

          <div className="track-layout">
            {track?.artworkUrl ? (
              <img src={track.artworkUrl} alt={track.trackName} className="track-artwork" />
            ) : (
              <div className="track-artwork placeholder">{"\u266A"}</div>
            )}

            <div className="track-copy">
              <h2>{track ? track.trackName : "No active track"}</h2>
              <p>{track ? track.artistName : "Start playback on Spotify"}</p>
              <p className="album-line">{track?.albumName ?? " "}</p>
            </div>
          </div>

          <div className="track-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressRatio}%` }} />
            </div>
            <div className="progress-labels">
              <span>{track ? formatMs(track.progressMs) : "0:00"}</span>
              <span>{track ? formatMs(track.durationMs) : "0:00"}</span>
            </div>
          </div>
        </article>

        <article className="overlay-config-card">
          <div className="overlay-config-header">
            <span>Overlay</span>
            <button
              type="button"
              className="settings-btn slim"
              onClick={() => {
                window.lyribolsa.overlay.createOrFocus().catch(console.error);
              }}
            >
              Open Overlay
            </button>
          </div>

          <div className="control compact">
            <label>Mode</label>
            <div className="mode-switch">
              <button
                type="button"
                className={preferences.mode === "edit" ? "mode-btn active" : "mode-btn"}
                onClick={() => {
                  updatePreferences({ mode: "edit" }).catch(console.error);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className={preferences.mode === "present" ? "mode-btn active" : "mode-btn"}
                onClick={() => {
                  updatePreferences({ mode: "present" }).catch(console.error);
                }}
              >
                Present
              </button>
            </div>
          </div>

          <div className="control compact">
            <label htmlFor="backgroundOpacity">Background ({Math.round(preferences.backgroundOpacity * 100)}%)</label>
            <input
              id="backgroundOpacity"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={preferences.backgroundOpacity}
              onChange={(event) => {
                updatePreferences({ backgroundOpacity: Number(event.target.value) }).catch(console.error);
              }}
            />
          </div>

          <div className="control compact">
            <label htmlFor="textOpacity">Text ({Math.round(preferences.textOpacity * 100)}%)</label>
            <input
              id="textOpacity"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={preferences.textOpacity}
              onChange={(event) => {
                updatePreferences({ textOpacity: Number(event.target.value) }).catch(console.error);
              }}
            />
          </div>

          <div className="control compact">
            <label htmlFor="fontSize">Font ({preferences.fontSize}px)</label>
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

          <div className="control compact">
            <label htmlFor="alwaysOnTop">
              Always on top {isPresentMode ? "(forced)" : ""}
            </label>
            <input
              id="alwaysOnTop"
              type="checkbox"
              checked={isPresentMode ? true : preferences.alwaysOnTop}
              disabled={isPresentMode}
              onChange={(event) => {
                window.lyribolsa.overlay
                  .setAlwaysOnTop(event.target.checked)
                  .then(setPreferences)
                  .catch(console.error);
              }}
            />
          </div>
        </article>
      </section>
    </main>
  );
}

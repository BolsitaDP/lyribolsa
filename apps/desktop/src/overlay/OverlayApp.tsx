import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { LyricsDto, TrackPlaybackDto } from "@lyribolsa/contracts";
import { useOverlayPreferencesStore } from "../state/overlayPreferences";

function getActiveLineIndex(lines: Array<{ timeMs: number; text: string }>, progressMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].timeMs <= progressMs) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

export function OverlayApp() {
  const preferences = useOverlayPreferencesStore((state) => state.preferences);
  const setPreferences = useOverlayPreferencesStore((state) => state.setPreferences);

  const [activeLine, setActiveLine] = useState(0);
  const [track, setTrack] = useState<TrackPlaybackDto | null>(null);
  const [lyrics, setLyrics] = useState<LyricsDto | null>(null);
  const [progressMs, setProgressMs] = useState(0);
  const [playbackClock, setPlaybackClock] = useState<{
    baseProgressMs: number;
    capturedAtMs: number;
    isPlaying: boolean;
    durationMs: number;
  } | null>(null);

  const lyricsScrollRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    let mounted = true;
    let lastTrackId = "";

    window.lyribolsa.overlay.getPreferences().then((prefs) => {
      if (mounted) {
        setPreferences(prefs);
      }
    });

    const unsubscribe = window.lyribolsa.overlay.onPreferencesUpdated((prefs) => {
      setPreferences(prefs);
    });

    async function pollPlaybackAndLyrics() {
      try {
        const currentPlayback = await window.lyribolsa.spotify.getCurrentTrack();
        if (!mounted) {
          return;
        }

        const currentTrack = currentPlayback.track;
        setTrack(currentTrack);

        if (!currentTrack) {
          setLyrics(null);
          setProgressMs(0);
          setPlaybackClock(null);
          lastTrackId = "";
          return;
        }

        setPlaybackClock({
          baseProgressMs: currentTrack.progressMs,
          capturedAtMs: Date.now(),
          isPlaying: currentTrack.isPlaying,
          durationMs: currentTrack.durationMs
        });

        if (currentTrack.spotifyTrackId !== lastTrackId) {
          lastTrackId = currentTrack.spotifyTrackId;
          setActiveLine(0);
          lineRefs.current = [];
          const resolvedLyrics = await window.lyribolsa.lyrics.resolveTrack(currentTrack);
          if (mounted) {
            setLyrics(resolvedLyrics.lyrics);
          }
        }
      } catch (_error) {
        if (mounted) {
          setTrack(null);
          setLyrics(null);
          setPlaybackClock(null);
        }
      }
    }

    pollPlaybackAndLyrics().catch(() => undefined);
    const interval = window.setInterval(() => {
      pollPlaybackAndLyrics().catch(() => undefined);
    }, 1400);

    return () => {
      mounted = false;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [setPreferences]);

  useEffect(() => {
    if (!playbackClock) {
      return;
    }

    const updateProgress = () => {
      const elapsed = playbackClock.isPlaying ? Date.now() - playbackClock.capturedAtMs : 0;
      const estimated = Math.round(playbackClock.baseProgressMs + elapsed);
      const clamped = Math.max(0, Math.min(playbackClock.durationMs, estimated));
      setProgressMs(clamped);
    };

    updateProgress();
    const interval = window.setInterval(updateProgress, 120);
    return () => {
      window.clearInterval(interval);
    };
  }, [playbackClock]);

  useEffect(() => {
    if (!lyrics?.syncedLyrics?.length) {
      setActiveLine(0);
      return;
    }
    setActiveLine(getActiveLineIndex(lyrics.syncedLyrics, progressMs));
  }, [lyrics?.syncedLyrics, progressMs]);

  useEffect(() => {
    if (!lyrics?.syncedLyrics?.length) {
      return;
    }

    const viewport = lyricsScrollRef.current;
    const activeNode = lineRefs.current[activeLine];
    if (!viewport || !activeNode) {
      return;
    }

    const targetTop = activeNode.offsetTop - viewport.clientHeight / 2 + activeNode.clientHeight / 2;
    viewport.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth"
    });
  }, [activeLine, lyrics?.syncedLyrics]);

  const plainLines = lyrics?.plainLyrics ? lyrics.plainLyrics.split(/\r?\n/).filter(Boolean).slice(0, 24) : [];
  const syncedLines = lyrics?.syncedLyrics ?? [];
  const isEditMode = preferences.mode === "edit";

  const startResize = (axis: "width" | "height") => async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const initialBounds = await window.lyribolsa.overlay.getBounds();
    const startMouseX = event.clientX;
    const startMouseY = event.clientY;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startMouseX;
      const deltaY = moveEvent.clientY - startMouseY;
      const nextBounds = { ...initialBounds };

      if (axis === "width") {
        nextBounds.width = Math.max(320, Math.round(initialBounds.width + deltaX));
      } else {
        nextBounds.height = Math.max(140, Math.round(initialBounds.height + deltaY));
      }

      window.lyribolsa.overlay.setBounds(nextBounds).catch(() => undefined);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <main className="overlay-root">
      <section
        className="overlay-panel"
        style={{
          background: `rgba(6, 8, 12, ${preferences.backgroundOpacity})`,
          fontSize: `${preferences.fontSize}px`
        }}
      >
        {isEditMode ? (
          <>
            <div className="overlay-drag-fab" title="Move overlay" aria-label="Move overlay">
              {"\u2195"}
            </div>
            <button type="button" className="overlay-resize-handle overlay-resize-width" onMouseDown={startResize("width")}>
              Width
            </button>
            <button type="button" className="overlay-resize-handle overlay-resize-height" onMouseDown={startResize("height")}>
              Height
            </button>
          </>
        ) : null}

        <div className="overlay-lyrics-scroll" ref={lyricsScrollRef}>
          <div
            className="overlay-lyrics-content"
            style={{
              opacity: preferences.textOpacity
            }}
          >
            {!track ? <div className="overlay-line active">Play a song on Spotify to show lyrics.</div> : null}
            {track && !lyrics ? <div className="overlay-line active">Looking for lyrics...</div> : null}
            {lyrics?.syncedLyrics?.length
              ? syncedLines.map((line, index) => (
                  <div
                    key={`${line.timeMs}-${line.text}`}
                    ref={(node) => {
                      lineRefs.current[index] = node;
                    }}
                    className={`overlay-line ${index === activeLine ? "active" : ""}`}
                  >
                    {line.text}
                  </div>
                ))
              : null}
            {track && lyrics && !lyrics.hasSynced && plainLines.length
              ? plainLines.map((line, index) => (
                  <div key={`${index}-${line}`} className="overlay-line active">
                    {line}
                  </div>
                ))
              : null}
            {track && lyrics && !lyrics.hasSynced && !plainLines.length ? (
              <div className="overlay-line active">Lyrics not available for this track.</div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

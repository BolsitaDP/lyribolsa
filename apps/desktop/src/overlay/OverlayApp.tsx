import { useEffect, useState } from "react";
import { useOverlayPreferencesStore } from "../state/overlayPreferences";

const demoSyncedLyrics = [
  { timeMs: 0, text: "No more guessing what line is playing" },
  { timeMs: 3000, text: "This floating window will highlight synced lyrics" },
  { timeMs: 6400, text: "If sync is missing, plain lyrics fallback is used" }
];

function getActiveLineIndex(progressMs: number): number {
  let low = 0;
  let high = demoSyncedLyrics.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (demoSyncedLyrics[mid].timeMs <= progressMs) {
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

  useEffect(() => {
    let currentProgressMs = 0;
    let mounted = true;

    window.lyribolsa.overlay.getPreferences().then((prefs) => {
      if (mounted) {
        setPreferences(prefs);
      }
    });

    const unsubscribe = window.lyribolsa.overlay.onPreferencesUpdated((prefs) => {
      setPreferences(prefs);
    });

    const interval = window.setInterval(() => {
      currentProgressMs = (currentProgressMs + 400) % 9000;
      setActiveLine(getActiveLineIndex(currentProgressMs));
    }, 400);

    return () => {
      mounted = false;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [setPreferences]);

  return (
    <main className="overlay-root">
      <section
        className="overlay-panel"
        style={{
          background: `rgba(10, 12, 16, ${preferences.opacity})`,
          fontSize: `${preferences.fontSize}px`
        }}
      >
        {demoSyncedLyrics.map((line, index) => (
          <div key={`${line.timeMs}-${line.text}`} className={`overlay-line ${index === activeLine ? "active" : ""}`}>
            {line.text}
          </div>
        ))}
      </section>
    </main>
  );
}

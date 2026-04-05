import type { OverlayPreferencesDto } from "@lyribolsa/contracts";

declare global {
  interface Window {
    lyribolsa: {
      auth: {
        openSpotifyLogin: (spotifyAuthUrl: string) => Promise<{ ok: boolean; error?: string }>;
      };
      overlay: {
        createOrFocus: () => Promise<{ ok: boolean }>;
        getPreferences: () => Promise<OverlayPreferencesDto>;
        updatePreferences: (partialPreferences: Partial<OverlayPreferencesDto>) => Promise<OverlayPreferencesDto>;
        setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<OverlayPreferencesDto>;
        setBounds: (bounds: Electron.Rectangle) => Promise<Electron.Rectangle>;
        getBounds: () => Promise<Electron.Rectangle>;
        onPreferencesUpdated: (callback: (preferences: OverlayPreferencesDto) => void) => () => void;
      };
    };
  }
}

export {};

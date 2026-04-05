import type {
  AuthSessionDto,
  CurrentTrackResponseDto,
  OverlayPreferencesDto,
  ResolveLyricsResponseDto,
  TrackPlaybackDto
} from "@lyribolsa/contracts";

declare global {
  interface Window {
    lyribolsa: {
      auth: {
        getStatus: () => Promise<AuthSessionDto>;
        connectSpotify: () => Promise<AuthSessionDto>;
        disconnectSpotify: () => Promise<AuthSessionDto>;
      };
      spotify: {
        getCurrentTrack: () => Promise<CurrentTrackResponseDto>;
      };
      lyrics: {
        resolveTrack: (track: TrackPlaybackDto) => Promise<ResolveLyricsResponseDto>;
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

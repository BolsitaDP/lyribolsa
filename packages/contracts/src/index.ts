export interface TrackPlaybackDto {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
  durationMs: number;
  isrc: string | null;
  progressMs: number;
  artworkUrl: string | null;
  isPlaying: boolean;
}

export interface SyncedLyricLineDto {
  timeMs: number;
  text: string;
}

export interface LyricsDto {
  source: "lrclib" | "cache";
  language: string | null;
  plainLyrics: string | null;
  syncedLyrics: SyncedLyricLineDto[] | null;
  hasSynced: boolean;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  isrc: string | null;
  matchConfidence: number;
  fetchedAt: string;
}

export interface ResolveLyricsRequestDto {
  track: TrackPlaybackDto;
}

export interface ResolveLyricsResponseDto {
  track: TrackPlaybackDto;
  lyrics: LyricsDto | null;
}

export type OverlayMode = "edit" | "present";

export interface OverlayPreferencesDto {
  mode: OverlayMode;
  backgroundOpacity: number;
  textOpacity: number;
  fontSize: number;
  alwaysOnTop: boolean;
}

export interface AuthSessionDto {
  sessionId: string;
  appUserId?: string;
  status: "pending" | "connecting" | "connected" | "error";
  connected: boolean;
  spotifyUserId?: string | null;
  spotifyDisplayName?: string | null;
  spotifyAvatarUrl?: string | null;
  error?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface CreateAuthSessionRequestDto {
  desktopClientId: string;
}

export interface CurrentTrackResponseDto {
  track: TrackPlaybackDto | null;
}

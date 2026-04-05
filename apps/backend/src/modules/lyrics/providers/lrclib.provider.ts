import type { TrackPlaybackDto } from "@lyribolsa/contracts";

export interface LrcLibProviderResult {
  plainLyrics: string | null;
  syncedLyrics: Array<{ timeMs: number; text: string }> | null;
  language: string | null;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  isrc: string | null;
}

export class LrcLibProvider {
  async fetchLyrics(_track: TrackPlaybackDto): Promise<LrcLibProviderResult | null> {
    return null;
  }
}

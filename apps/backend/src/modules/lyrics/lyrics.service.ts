import type { LyricsDto, ResolveLyricsRequestDto, ResolveLyricsResponseDto } from "@lyribolsa/contracts";
import { LrcLibProvider } from "./providers/lrclib.provider.js";

export class LyricsService {
  constructor(private readonly provider: LrcLibProvider) {}

  async resolveLyrics(request: ResolveLyricsRequestDto): Promise<ResolveLyricsResponseDto> {
    const providerResult = await this.provider.fetchLyrics(request.track);

    let lyrics: LyricsDto | null = null;
    if (providerResult) {
      lyrics = {
        source: "lrclib",
        language: providerResult.language,
        plainLyrics: providerResult.plainLyrics,
        syncedLyrics: providerResult.syncedLyrics,
        hasSynced: Boolean(providerResult.syncedLyrics && providerResult.syncedLyrics.length > 0),
        title: providerResult.title,
        artist: providerResult.artist,
        album: providerResult.album,
        durationMs: providerResult.durationMs,
        isrc: providerResult.isrc,
        matchConfidence: 0.5,
        fetchedAt: new Date().toISOString()
      };
    }

    return {
      track: request.track,
      lyrics
    };
  }
}

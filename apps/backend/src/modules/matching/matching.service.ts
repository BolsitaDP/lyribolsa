export class MatchingService {
  normalizeText(input: string): string {
    return input
      .toLowerCase()
      .replace(/\(.*?(feat|ft|live|remaster|version|explicit).*?\)/gi, "")
      .replace(/\b(feat|ft)\.?\s+.+$/gi, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  isWithinDurationTolerance(trackDurationMs: number, lyricsDurationMs: number, toleranceMs = 3000): boolean {
    return Math.abs(trackDurationMs - lyricsDurationMs) <= toleranceMs;
  }
}

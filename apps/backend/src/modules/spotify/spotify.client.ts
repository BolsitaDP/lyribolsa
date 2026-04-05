import { env } from "../../config/env.js";

const SPOTIFY_ACCOUNTS_BASE_URL = "https://accounts.spotify.com";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

function getSpotifyBasicAuthorizationHeader(): string {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("Spotify client credentials are not configured.");
  }
  return Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
}

async function requestSpotifyToken(params: URLSearchParams): Promise<SpotifyTokenResponse> {
  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE_URL}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getSpotifyBasicAuthorizationHeader()}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Spotify token request failed (${response.status}): ${message}`);
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export async function exchangeAuthorizationCode(code: string): Promise<SpotifyTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.SPOTIFY_REDIRECT_URI
  });
  return requestSpotifyToken(params);
}

export async function refreshSpotifyAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  return requestSpotifyToken(params);
}

export async function fetchSpotifyProfile(accessToken: string): Promise<{ id: string }> {
  const response = await fetch(`${SPOTIFY_API_BASE_URL}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Spotify profile request failed (${response.status}): ${message}`);
  }

  const profile = (await response.json()) as { id: string };
  return { id: profile.id };
}

interface SpotifyPlaybackTrackItem {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images?: Array<{ url: string; width: number | null; height: number | null }>;
  };
  duration_ms: number;
  external_ids?: {
    isrc?: string;
  };
}

export interface SpotifyCurrentPlaybackResponse {
  is_playing: boolean;
  progress_ms: number | null;
  currently_playing_type: string;
  item: SpotifyPlaybackTrackItem | null;
}

export async function fetchSpotifyCurrentPlayback(accessToken: string): Promise<SpotifyCurrentPlaybackResponse | null> {
  const response = await fetch(`${SPOTIFY_API_BASE_URL}/me/player/currently-playing`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Spotify current playback request failed (${response.status}): ${message}`);
  }

  return (await response.json()) as SpotifyCurrentPlaybackResponse;
}

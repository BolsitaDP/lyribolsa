CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spotify_connection (
  id UUID PRIMARY KEY,
  app_user_id UUID NOT NULL REFERENCES app_user (id),
  spotify_user_id TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS track (
  id UUID PRIMARY KEY,
  spotify_track_id TEXT,
  isrc TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_ms INTEGER NOT NULL,
  normalized_title TEXT NOT NULL,
  normalized_artist TEXT NOT NULL,
  normalized_album TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lyrics_record (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_ms INTEGER,
  isrc TEXT,
  language TEXT,
  plain_lyrics TEXT,
  synced_lyrics_json JSONB,
  has_synced BOOLEAN NOT NULL DEFAULT FALSE,
  normalized_title TEXT NOT NULL,
  normalized_artist TEXT NOT NULL,
  match_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.000,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS track_lyrics_match (
  id UUID PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES track (id),
  lyrics_record_id UUID NOT NULL REFERENCES lyrics_record (id),
  strategy TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_track_spotify_track_id ON track (spotify_track_id);
CREATE INDEX IF NOT EXISTS idx_track_isrc ON track (isrc);
CREATE INDEX IF NOT EXISTS idx_lyrics_record_isrc ON lyrics_record (isrc);
CREATE INDEX IF NOT EXISTS idx_lyrics_record_norm_artist_title ON lyrics_record (normalized_artist, normalized_title);
CREATE INDEX IF NOT EXISTS idx_lyrics_record_expires_at ON lyrics_record (expires_at);

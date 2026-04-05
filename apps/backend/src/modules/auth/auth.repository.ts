import { randomUUID } from "node:crypto";
import type { SpotifyConnection } from "./auth.store.js";
import { pool } from "../../db/pool.js";

export async function ensureAppUserExists(appUserId: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO app_user (id)
      VALUES ($1::uuid)
      ON CONFLICT (id) DO NOTHING
    `,
    [appUserId]
  );
}

export async function findSpotifyConnectionByAppUserId(appUserId: string): Promise<SpotifyConnection | null> {
  const result = await pool.query<{
    access_token_enc: string;
    refresh_token_enc: string;
    expires_at: string;
    spotify_user_id: string | null;
  }>(
    `
      SELECT access_token_enc, refresh_token_enc, expires_at, spotify_user_id
      FROM spotify_connection
      WHERE app_user_id = $1::uuid
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [appUserId]
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];
  return {
    accessToken: row.access_token_enc,
    refreshToken: row.refresh_token_enc,
    expiresAt: new Date(row.expires_at).getTime(),
    spotifyUserId: row.spotify_user_id
  };
}

export async function saveSpotifyConnection(appUserId: string, connection: SpotifyConnection): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM spotify_connection WHERE app_user_id = $1::uuid", [appUserId]);
    await client.query(
      `
        INSERT INTO spotify_connection (
          id,
          app_user_id,
          spotify_user_id,
          access_token_enc,
          refresh_token_enc,
          expires_at
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, to_timestamp($6 / 1000.0))
      `,
      [
        randomUUID(),
        appUserId,
        connection.spotifyUserId,
        connection.accessToken,
        connection.refreshToken,
        connection.expiresAt
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

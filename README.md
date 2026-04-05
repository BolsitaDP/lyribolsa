# lyribolsa MVP (Embedded Mode)

Current default runtime is fully embedded:

- `apps/desktop`: Electron + React + TypeScript
- `packages/contracts`: shared DTO contracts
- Spotify auth, current-track fetch and LRCLIB lyrics resolution run inside Electron `main` process via IPC.

## Quick Start

1. Install dependencies:
   - `npm install`
2. Create desktop env file:
   - `copy apps\\desktop\\.env.example apps\\desktop\\.env`
3. Set `SPOTIFY_CLIENT_ID` in `apps/desktop/.env`.
4. Run app:
   - `npm run dev`

## Spotify Setup

1. Create an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Configure Redirect URI exactly:
   - `http://127.0.0.1:45879/spotify/callback`
3. Enable API:
   - `Web API`

Then open desktop app and click `Connect Spotify`.

## Build Windows .exe

1. Ensure `apps/desktop/.env` exists and `SPOTIFY_CLIENT_ID` is set.
2. Build installer from repo root:
   - `npm run dist:win`
3. Output:
   - `apps/desktop/release/Lyribolsa-Setup-0.1.0.exe`

Optional unpacked build (for quick local smoke test):

- `npm run pack:win`

## Notes

- Lyrics are fetched from LRCLIB and cached locally with TTL.
- Overlay preferences and auth state are stored locally in Electron Store.
- Legacy cloud/backend scaffold remains in `apps/backend` for future migration.

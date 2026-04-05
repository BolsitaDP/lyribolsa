# lyribolsa MVP

Monorepo base scaffold:

- `apps/backend`: Node.js + Express + TypeScript API for Spotify auth/playback and lyrics resolution with LRCLIB-backed caching.
- `apps/desktop`: Electron + React + TypeScript desktop app with main window and floating overlay window.
- `packages/contracts`: shared TypeScript contracts (DTOs and domain payloads).

## Quick Start

1. Install dependencies:
   - `npm install`
2. Run backend + desktop in parallel:
   - `npm run dev`

## Spotify OAuth Setup (Current Phase)

1. Create an app in Spotify Developer Dashboard:
   - [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Configure Redirect URI exactly:
   - `http://127.0.0.1:4000/v1/auth/spotify/callback`
3. Copy backend env file:
   - `copy apps\\backend\\.env.example apps\\backend\\.env`
4. Set:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
5. Make sure PostgreSQL is running and reachable via `DATABASE_URL` (`apps/backend/.env`).
   - The backend auto-applies `apps/backend/db/migrations/0001_init.sql` on startup.

After that, start the app with `npm run dev`, press `Connect Spotify`, authorize in browser, then return to the desktop app.

## Current Phase

This is Phase 1 scaffold:

- project structure
- core route skeletons
- IPC boundaries and window bootstrap
- initial PostgreSQL migration draft

Feature implementation will be incremental on top of this base.

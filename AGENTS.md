# AGENTS: Repo Guide for Future Codex Runs

This document orients agents working in this monorepo. It captures structure, conventions, invariants, and how to safely extend the Marble Race app.


## Monorepo Overview

- Tooling
  - Node: use the version available; repo builds on Node 20+.
  - Package manager: `pnpm@9`. Root `packageManager` pins it.
  - TypeScript: 5.x. Bundled via `tsup` across packages and `vite` for the web app.
- Workspaces
  - `apps/marblerace/*`: main application (protocol, server, web, ui-kit, app starter).
  - `packages/*`: shared libraries for algodoo server/client/runtime and examples.

Primary commands
- Build everything: `pnpm -r build`
- Run Marble Race (builds all first then starts): `pnpm run marblerace`
- Web dev for the SPA only: `pnpm --filter marblerace-web run dev` (served by Vite)


## Marble Race Architecture (apps/marblerace)

- Protocol (`apps/marblerace/protocol`)
  - Shared contracts (types and constraints) used by server and web.
  - Exposes `protocolVersion`, clamp ranges for marble config, and `StagePhase` including `'prep'`.

- Server (`apps/marblerace/server`)
  - Implements an `algodoo-server` plugin that serves the SPA, exposes health/config endpoints, and runs a Colyseus game room.
  - Starts a dedicated Colyseus server on a separate port (default `2567`) to avoid WS conflicts with `algodoo-server`.
  - Static file serving is path-traversal safe and sets cache headers for `/assets`.
  - Important env vars
    - `PORT` (default `8080`): HTTP server for `/admin`, `/game`, `/dashboard` and `/mr/*`.
    - `MARBLERACE_COLYSEUS_PORT` (default `2567`).
    - `MARBLERACE_ADMIN_TOKEN` (default `'changeme'`): Admin actions require this. Set empty to disable auth (not recommended).
    - `MARBLERACE_LOG` (`info` or `debug`).
  - HTTP endpoints
    - `/mr/health`: JSON status including transport health.
    - `/mr/config`: Returns `{ colyseusUrl }` for the web client. Honors `x-forwarded-proto`.
    - SPA: `/admin`, `/game`, `/dashboard` are served from `apps/marblerace/web/dist`.

- Room (`RaceRoom`)
  - State schema (Colyseus): `RaceStateSchema` and per-player `PlayerSchema`.
  - Phases
    - Global: `'lobby' | 'intermission' | 'countdown' | 'running' | 'finished'`.
    - Stage: `'loading' | 'prep' | 'countdown' | 'running' | 'stage_finished'`.
  - New player flow (key invariants)
    - Stage moves to `'prep'` after Algodoo signals `stage.ready`.
    - Players customize and can `spawn` only in `'prep'` or `'countdown'` (and before race starts).
    - After a player spawns (flag `player.spawned = true`), their config cannot be changed.
    - Admin flow: From lobby, `start` loads stage → `'prep'`. Another `start` during `'prep'` triggers countdown.
  - Allowed client messages
    - `'handshake'`: version check.
    - `'join'`: add/update player in lobby.
    - `'setConfig'`: only during `'prep'` or `'countdown'` and if `!player.spawned`.
    - `'spawn'`: only during `'prep'` or `'countdown'`; locks player.
  - Admin actions (require `MARBLERACE_ADMIN_TOKEN`)
    - `createRace`, `openLobby`, `lockLobby`, `start`, `reset`, `finish`, `nextStage`, `setAutoAdvance`.
  - Ticker
    - Rolling events list (most recent first) for dashboard updates: join/lobby/stage/spawn/finish, etc.

- Orchestrator (`apps/marblerace/server/src/orchestrator.ts`)
  - Adapter between high-level game actions and Algodoo Thyme scripting.
  - Methods are stubs to be implemented via `submitEval/submitEvalAsync`:
    - `loadStage(stageId)`, `spawnMarble(player)`, `spawnMarbles(players)`, `countdown(seconds)`, `go()`, `resetStage(stageId)`.
  - Incoming events from Algodoo should be forwarded via `orchestrator.handleEvent(ev)`.

- Web (`apps/marblerace/web`)
  - React SPA with routes `/admin`, `/game`, `/dashboard`.
  - Connects to Colyseus at `GET /mr/config` discovered endpoint (fallback to `http(s)://{host}:2567`).
  - Admin page
    - Visible Admin Token field (also supports `?token=...`), sent with admin actions, persisted to `localStorage`.
    - If token invalid, the server replies with `admin.denied` and the UI shows an alert.
can we    - Media: supports setting a Spotify playlist (by ID or URL). Server stores `spotifyPlaylistId`; Dashboard embeds the playlist above the event tracker next to the QR.
  - Game page
    - Clean flow: prompt for name → in `'prep'` or `'countdown'` show “Prepare Your Marble”.
    - Points-based customization: 10 points across diameter/density/friction/restitution using +/– controls and progress bars. Values are mapped across protocol clamp ranges.
    - Spawn button: spawns the player marble(s) and locks further config. Spawn allowed until race starts.
  - UI Kit provides pixel-styled components used across pages.


## Transport and Integration

- `algodoo-server` plugin context is wired in `apps/marblerace/server/src/transport.ts` to expose `submitEval` and `submitEvalAsync`.
- The sample `packages/algodoo-client` connects to the `algodoo-server` WS and handles a file-based queue (`input.txt`/`ack.txt`), including a reset handshake. After Algodoo acknowledges the `RESET` command, the client sends a `reset.ack` control message; the server then clears its queue and resets sequence counters to 0. The client drops any buffered commands across a reset to guarantee a fresh start. It periodically publishes available scene files back to the server (used on Admin page).


## Security & Hardening

- Static serving: `safeJoin` prevents directory traversal; assets served with correct content types and cache headers for `/assets`.
- Admin auth: token required by default. Keep `MARBLERACE_ADMIN_TOKEN` secret in production.
- Phase gating: `setConfig` and `spawn` are both gated by phase and per-player lock.


## Logging & Debugging

- Set `MARBLERACE_LOG=debug` for detailed plugin/room/orchestrator logs.
- Set `ALGODOO_SERVER_LOG=debug` to inspect WS transport and queue behavior.
- Check `/mr/health` and `/mr/config` for quick diagnostics.
- Client-side: Colyseus client logs errors on join and room events in the console.


## Invariants & Contracts (Do Not Break)

- Protocol version: server validates via `'handshake'`.
- Stage phases include `'prep'`; server assumes clients will present prep UI and send `spawn` during `'prep'` or `'countdown'`.
- `Player.spawned` indicates config lock for that stage.
- Points/clamping: server remains authoritative; client UI should stay within `clampRanges` but server clamps regardless.


## Common Tasks for Agents

- Implement Algodoo Thyme integration
  1) Wire `Orchestrator` methods to submit Thyme scripts.
  2) Hook Algodoo events to `orchestrator.handleEvent(ev)`:
     - `stage.ready`, `marble.finish`, `stage.timeout`, `stage.reset`.
  3) Remove fallback auto `stage.ready` after real integration is validated.

- Tune the points system
  - Adjust `TOTAL_POINTS`, stat `MAX_PER_STAT`, or the ease curve in Game UI.
  - Consider per-stat costs (e.g., radius costs more per point than friction) while respecting clamp ranges.

- Extend phases or UI
  - Add a “Warmup” or “Practice” sub-phase before `'prep'`.
  - Dashboard: show how many players have spawned, and highlight countdown overlay.

- Improve admin UX
  - Add stage presets, seed input, or timeout controls.
  - Provide undo/reset for player spawns (server would need an admin action to unspawn a player during `'prep'`).


## Coding Guidelines

- Keep edits minimal and focused; prefer small, composable changes with clear commit messages.
- Favor TypeScript types on server handlers (`Client` parameters, payload shapes).
- Follow existing file/module layout; avoid large renames unless necessary.
- Don’t introduce new build tools; keep using `tsup`, `vite`, `pnpm`.
- When adding new messages or phases, update both protocol and server schema, and touch the web client as needed.


## Validation Checklist

- Build: `pnpm -r build` completes across all workspaces.
- Web: `/admin`, `/game`, `/dashboard` load from `apps/marblerace/web/dist`.
- Admin token: can be entered in UI (or via `?token=`) and is required unless explicitly disabled.
- Prep flow: after Admin Start from lobby, stage enters `'prep'`; players can adjust and spawn; config locks after spawn.
- Countdown: Admin Start during `'prep'` triggers countdown; spawn still allowed; locked once `'running'` begins.


## Known Gaps / TODOs

- Orchestrator Thyme scripts are stubs; implement for real Algodoo integration.
- Late-join policy during `'prep'` is currently the same as lobby; consider allowing joins explicitly in `'prep'`.
- Granular per-stat costs (e.g., quadratic costs) not implemented; UI uses a single budget with a mild ease curve.
- No persistent storage of race results (in-memory only via Colyseus state).


## Quick Start (Operator)

1) `pnpm install`
2) `pnpm -r build`
3) `pnpm run marblerace`
4) Visit `/admin` (set token), `/game`, `/dashboard`

Environment
- `PORT=8080` (default)
- `MARBLERACE_COLYSEUS_PORT=2567` (default)
- `MARBLERACE_ADMIN_TOKEN=changeme` (change for production)
- `MARBLERACE_LOG=debug` and `ALGODOO_SERVER_LOG=debug` for verbose logs


## Contact Points in Code

- Protocol: `apps/marblerace/protocol/src/index.ts`
- Server Plugin: `apps/marblerace/server/src/plugin.ts`
- Room: `apps/marblerace/server/src/room.ts`
- Orchestrator: `apps/marblerace/server/src/orchestrator.ts`
- Transport (submitEval): `apps/marblerace/server/src/transport.ts`
- Web entry: `apps/marblerace/web/src/main.tsx`
- Web pages: `apps/marblerace/web/src/pages/*`
- UI kit: `apps/marblerace/ui-kit/src/index.tsx`


---
This file is for agents. Keep it updated when changing flows, phases, or contracts so future runs ramp up faster.

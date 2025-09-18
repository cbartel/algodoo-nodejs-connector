# Marble Race (Algodoo + Colyseus)

Authoritative, multi-stage “Marble Race” implemented as an `algodoo-server` plugin. Physics runs in Algodoo; orchestration and networking use Colyseus. Three UIs are served by the plugin: `/admin`, `/game`, `/dashboard`.

## Monorepo layout

- `apps/marblerace/protocol`: Versioned contracts and shared constraints.
- `apps/marblerace/server`: Algodoo plugin + Colyseus room and orchestration stubs.
- `apps/marblerace/web`: React SPA (Pixel-Art UI) with routes `/admin`, `/game`, `/dashboard`.
- `apps/marblerace/ui-kit`: Shared pixel components (fonts, buttons, panels, tables, countdown, badges, QR).
- `apps/marblerace/app`: Convenience starter that boots `algodoo-server` with the Marble Race plugin.

## Quick start

1) Install and build

- `pnpm install`
- `pnpm -r build`

2) Run the app (from repo root)

- `pnpm run marblerace`
- Visit `http://localhost:8080/admin` (and `/game`, `/dashboard`).

Environment variables:

- `PORT`: HTTP port (default `8080`).
- `MARBLERACE_ADMIN_TOKEN`: Admin token (default `changeme`). Set a strong value in production. Leave empty to disable auth (not recommended).

Health:

- `GET /mr/health` → `{ ok: true, name: "marblerace" }`

## Admin flow

- Create race: define ordered `stages` (Algodoo scene ids), optional `seed`, `perStageTimeoutMs`, and `pointsTable`.
- Open Lobby: players join and edit their marble config. Server clamps values using shared constraints.
- Start: loads Stage 1 in Algodoo, spawns marbles, runs countdown, then starts the race.
- Stage finishes: server records finish order via Algodoo events and awards points per the points table. DNFs get 0.
- Advance: auto-advance or manual `Next Stage` until race finishes; dashboard ranks by total points (with tie-breaks).

## Server authority

- Authoritative Colyseus state: race phases, stage phases, players, per-stage results, points table, timeout, ticker.
- Client messages (`join`, `setConfig`) are accepted only in allowed phases; values are clamped server-side.
- Admin actions: `createRace`, `openLobby`, `lockLobby`, `start`, `reset`, `finish`, `nextStage`, `setAutoAdvance`.
- Reconnects: late joiners receive the full current snapshot.

## Algodoo orchestration contract

Commands (server → Algodoo):

- `loadStage(stageId)`: Load scene, prepare finish triggers; emit `stage.ready` when ready.
- `spawnMarbles(players)`: Spawn one marble per player with server-clamped config; tag marbles by `playerId`.
- `countdown(seconds)`: Show HUD countdown.
- `go()`: Start the run; emit `marble.finish` per marble `{ playerId, order, ts }`.
- `resetStage(stageId)`: Reset scene; emit `stage.reset` when done.

Events (Algodoo → server):

- `stage.ready`, `marble.finish`, `stage.timeout`, `stage.reset`.

Integration points:

- See `apps/marblerace/server/src/orchestrator.ts`. Each method has precise comments. Wire these to the existing runtime’s `submitEval(thyme)` and feed incoming Algodoo events to `orchestrator.handleEvent(...)`.

## Protocol package

- `protocolVersion` + handshake for client rejection on mismatch.
- Phases: `RacePhase` and `StagePhase`.
- Constraints: exported clamp ranges for radius, density, friction, restitution, linear/ang damping, and RGB validation.
- Shared types: `RaceState`, `Player`, `MarbleConfig`, `PointsTable`, client/admin messages, Algodoo commands/events.

## UI routes

- `/admin`: create race, open/lock lobby, start/reset/finish, next stage, points, per-player status; shows auto-advance.
- `/game`: lobby name/config with server-applied clamps; read-only HUD during stages.
- `/dashboard`: public scoreboard by points with tie-breaks; shows phases, countdown, QR to `/game`.

## Notes

- The plugin statically serves the SPA from `apps/marblerace/web/dist` and guards against path traversal.
- Ensure the web build is present (the convenience starter builds the full workspace before starting).
- Default admin token is `changeme`. Always override in production.
- Future features (power-ups, telemetry overlays, anti-stuck) should slot into the orchestrator and room without re-architecting.

## Development commands

- Build everything: `pnpm -r build`
- Run Marble Race: `pnpm run marblerace`

Logging:

- Set `MARBLERACE_LOG=debug` to see plugin/room/orchestrator logs.
- Set `ALGODOO_SERVER_LOG=debug` to see core server router + ws logs.

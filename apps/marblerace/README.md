# Marble Race (Algodoo + Colyseus)

Authoritative, multi-stage “Marble Race” implemented as an `algodoo-server` plugin. Physics runs in Algodoo; orchestration and networking use Colyseus. Three UIs are served by the plugin: `/admin`, `/game`, `/dashboard`.

For a simple run-through, see [docs/marblerace/quick-start.md](../../docs/marblerace/quick-start.md).
For detailed wiring and customization, see [docs/marblerace/advanced-setup.md](../../docs/marblerace/advanced-setup.md).

## Layout

- `apps/marblerace/protocol`: Versioned contracts and shared constraints.
- `apps/marblerace/server`: Algodoo plugin + Colyseus room + orchestration adapter.
- `apps/marblerace/web`: React SPA (Pixel UI) with routes `/admin`, `/game`, `/dashboard`.
- `apps/marblerace/ui-kit`: Shared pixel components (fonts, buttons, panels, tables, countdown, badges, QR).
- `apps/marblerace/app`: Convenience starter that boots `algodoo-server` with the Marble Race plugin.

## Quick Start

1) Install and build
- `pnpm install`
- `pnpm -r build`

2) Start the file bridge (algodoo-client)
- From the directory containing `input.txt`/`ack.txt`/`output.txt` (or set envs `INPUT`/`ACK`/`OUTPUT`), run:
- `node packages/algodoo-client/dist/index.js`
- See [docs/marblerace/quick-start.md](../../docs/marblerace/quick-start.md) (simple) or [docs/marblerace/advanced-setup.md](../../docs/marblerace/advanced-setup.md) (advanced) for details.

3) Run the app (from repo root)
- `pnpm run marblerace`
- Visit `http://localhost:8080/admin` (and `/game`, `/dashboard`).

Environment variables:
- `PORT` (default `8080`): HTTP port for `/admin`, `/game`, `/dashboard`, `/mr/*`.
- `MARBLERACE_COLYSEUS_PORT` (default `2567`): Dedicated Colyseus port.
- `MARBLERACE_COLYSEUS_HOST` (default `0.0.0.0`): Bind host for Colyseus.
- `MARBLERACE_PUBLIC_HOST` or `MARBLERACE_PUBLIC_URL`: Override the advertised host/url in `/mr/config` (useful behind reverse proxies). If localhost, the server will prefer a LAN IPv4 for QR scannability.
- `MARBLERACE_ADMIN_TOKEN` (default `changeme`): Admin actions require this. Set empty to disable auth (not recommended).
- `MARBLERACE_LOG` (`info` or `debug`): Marble Race logs.
- `ALGODOO_SERVER_LOG` (`info` or `debug`): Core transport logs.

Health and config endpoints:
- `GET /mr/health` → `{ ok, name: 'marblerace', algodoo: { hasClient, ... }, output: { lastSeq, gaps }, ping: { pingOk, lastPingAt, lastPingRtt } }`
- `GET /mr/config` → `{ colyseusUrl, publicHttpUrl }`

## Architecture

### Server Plugin (`apps/marblerace/server/src/plugin.ts`)
- Serves the SPA for `/admin`, `/game`, `/dashboard` from `web/dist` using `safeJoin` to prevent path traversal. Fingerprinted assets under `/assets` are cached.
- Exposes HTTP endpoints under `/mr` (`/mr/health`, `/mr/config`).
- Runs a dedicated Colyseus server on a separate port to avoid conflicts with `algodoo-server` WS.
- Bridges Algodoo transport to the room via `wireTransport`, tracks algodoo-client session health, publishes scene file lists, and maps low-level `output` tuples to canonical events.

### Room and State (`apps/marblerace/server/src/room.ts`, `schema.ts`)
- Authoritative state via Colyseus schemas: players, phases, stages, points, timers, ticker, scenes, ceremony, Spotify playlist, clamp ranges, unique color enforcement, marble multiplier.
- Phases
  - Global: `lobby` → `intermission` → `countdown` → `running` → `finished`.
  - Stage: `loading` → `prep` → `countdown` → `running` → `stage_finished`.
- New player flow
  - Admin opens lobby → players `join` and pick a color. When a stage becomes ready (`stage.ready`), stage moves to `prep`.
  - Players can adjust stats and `spawn` only during `prep` or `countdown`. After spawn, their config is locked for the stage.
- Points and standings
  - Supports legacy per-placement `pointsTable` and new tiered `pointsTiers` (e.g., `3x10,5x7,2x5`).
  - Deterministic standings with tie-breaks: total points, best placement, earliest best stage, then name.
- Unique colors
  - Optional enforcement (default ON). Denies colors that are too perceptually similar (OKLab distance) to existing players’ colors.
- Timers
  - Optional `perPrepTimeoutMs` auto-starts a 10s countdown when prep expires. Post-stage delay (`perPostStageDelayMs`) gates auto-advance when enabled.
- Cheers
  - Players can send lightweight cheer events during running/countdown and intermission prep; dashboards animate bursts.

### Orchestrator (`apps/marblerace/server/src/orchestrator.ts`)
- Adapter for high-level commands to Algodoo Thyme via `submitEval/submitEvalAsync`.
- Implemented commands:
  - `loadStage(stageId)`: opens the scene and requests a transport reset handshake.
  - `spawnMarble(player)`: spawns marble(s) with color/physics, honoring `marbleMultiplier` (trail pen included).
  - `countdown(seconds)`: placeholder (wire up HUD in Algodoo).
  - `go()`: removes start block to begin the run.
  - `resetStage(stageId)`: reloads the stage.
- Incoming Algodoo events must be forwarded to `orchestrator.handleEvent(ev)`.

Scene expectations: the Algodoo scene should provide `scene.my.spawn` (vector spawn point), `scene.my.marblecount` (int), and a `scene.my.startblock` (entity) that is removed on `go()`. See [docs/marblerace/advanced-setup.md](../../docs/marblerace/advanced-setup.md) for details and examples.

### Transport (`apps/marblerace/server/src/transport.ts`)
- Binds `submitEval`, `submitEvalAsync`, `submitRawAsync` and broadcast helpers from the active `algodoo-server` context.
- `requestClientReset()` asks the algodoo-client to perform a RESET handshake; counters are reset and queues cleared.
- `requestClientScanScenes()` prompts a scene directory scan; results populate `state.scenes` and cache.
- `submitPingAsync()` emits a low-level PING to gauge WS roundtrip.

### Protocol (`apps/marblerace/protocol/src/index.ts`)
- Exposes `protocolVersion`, phases, clamp ranges, defaults, types, and ranking helpers.
- Handshake: clients include `protocolVersion` and a stable `playerKey` to re-associate sessions.

### Web (`apps/marblerace/web`)
- `/admin`
  - Create race from discovered scenes (with repeats and display names), configure points tiers, clamp ranges, marble multiplier.
  - Controls: open/lock lobby, start, next stage, reset, finish, ceremony start/stop, scan scenes, set titles, Spotify playlist, auto-advance and delays.
  - Pings `/mr/health` to show algodoo transport RTT and liveness.
- `/game`
  - Join lobby with name + color (with similarity suggestions when enforcement is on).
  - Prepare Your Marble: 10-point allocation across diameter/density/friction/restitution with easing within server ranges.
  - Spawn during `prep`/`countdown`; config locks until the next stage.
  - Persistent local `playerKey` and reconnection token ensure resilience across reloads.
- `/dashboard`
  - Standings, stage/state overlays, countdown, QR to `/game`, music embed via `spotifyPlaylistId`.
  - Animates real-time cheer bursts and reward badges when points accrue.

## Admin API (via room message `admin`)

Actions (require valid `MARBLERACE_ADMIN_TOKEN` unless blank):
- `createRace` `{ stages: { id, name?, repeats? }[], tiers?: { count, points }[] }`
- `openLobby` • `lockLobby`
- `start` (start first stage from lobby, or begin countdown during `prep`)
- `reset` (reset current stage and return to lobby)
- `finish` (end race → `finished`)
- `nextStage` (advance when in `stage_finished`)
- `setAutoAdvance` `{ auto }`
- `setAutoAdvanceDelay` `{ seconds? | ms? }`
- `setPrepTimeout` `{ seconds? | ms? }`
- `setClampRanges` `{ radius|density|friction|restitution: { min, max } }`
- `setMarbleMultiplier` `{ value: 0.5..4.0 }`
- `scanScenes`
- `setSpotifyPlaylist` `{ id: string | url | uri }`
- `setEnforceUniqueColors` `{ enforce: boolean }`
- `setTitle` `{ title }`
- `removePlayer` `{ playerId }`

Client messages and gating:
- `handshake` `{ protocolVersion, playerKey? }` → disconnects on mismatch.
- `join` `{ name, playerKey?, color? }` → allowed only when lobby is open.
- `setConfig` `{ partial }` → allowed only during `prep` or `countdown` and if not spawned.
- `spawn` → allowed only during `prep` or `countdown` and if not spawned.
- `cheer` `{ icon?, text? }` → allowed during running/countdown, and during intermission prep.

## Security & Hardening

- Static serving uses `safeJoin` to prevent path traversal; correct content types are applied; `/assets` are cacheable.
- Admin auth is required by default (token). Do not disable in production.
- Phase gating for `setConfig` and `spawn` and per-player locks enforce fairness; server clamps all incoming values.

## Development & Logging

- Build all: `pnpm -r build`
- Run app: `pnpm run marblerace`
- Logs: `MARBLERACE_LOG=debug` and/or `ALGODOO_SERVER_LOG=debug`

## Validation Checklist

- Build completes: `pnpm -r build`.
- `/admin`, `/game`, `/dashboard` served from `apps/marblerace/web/dist`.
- Admin token can be entered in UI (or `?token=`) and is required unless disabled.
- Prep flow: after Start from lobby → stage enters `prep`; players can adjust + spawn; config locks after spawn.
- Countdown: Start during `prep` triggers countdown; spawn still allowed; locks when `running` begins.

## Known Gaps / TODOs

- Countdown HUD Thyme script is a placeholder; wire a visual overlay.
- Algodoo event integration should replace the fallback auto `stage.ready` once validated.
- Consider allowing explicit late joins during `prep` (policy currently mirrors lobby).
- No persistence of results (in-memory state only) — consider storage.

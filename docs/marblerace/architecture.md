# Marble Race — Architecture & Flows

High‑level architecture, phases, and integration points. Source links refer to the monorepo.

Navigation: [Overview](./README.md) • [Quick Start](./quick-start.md) • [Advanced Setup](./advanced-setup.md) • [Docs Home](../README.md)

## Overview

- Protocol: shared contracts used by server and web. See [apps/marblerace/protocol/src/index.ts](../../apps/marblerace/protocol/src/index.ts)
- Server plugin: serves UIs, exposes `/mr/*`, bridges Algodoo ↔ Colyseus. See [apps/marblerace/server/src/plugin.ts](../../apps/marblerace/server/src/plugin.ts)
- Room: authoritative state and gating. See [apps/marblerace/server/src/room.ts](../../apps/marblerace/server/src/room.ts) and [apps/marblerace/server/src/schema.ts](../../apps/marblerace/server/src/schema.ts)
- Orchestrator: Thyme adapter. See [apps/marblerace/server/src/orchestrator.ts](../../apps/marblerace/server/src/orchestrator.ts)
- Transport: binds to `algodoo-server` context. See [apps/marblerace/server/src/transport.ts](../../apps/marblerace/server/src/transport.ts)
- Web: `/admin`, `/game`, `/dashboard`. Entry at [apps/marblerace/web/src/main.tsx](../../apps/marblerace/web/src/main.tsx)

## Server Endpoints

- Health: `GET /mr/health` → `{ ok, name: 'marblerace', algodoo, output: { lastSeq, gaps }, ping: { pingOk, lastPingAt, lastPingRtt } }`
- Config: `GET /mr/config` → `{ colyseusUrl, publicHttpUrl }` (honors reverse proxy headers and public envs)
- Static SPA at `/admin`, `/game`, `/dashboard` from `web/dist` (path‑traversal safe, cache for `/assets`)

## Phases

- Global: `lobby` → `intermission` → `countdown` → `running` → `finished`
- Stage: `loading` → `prep` → `countdown` → `running` → `stage_finished`

## Player Flow & Gating

- Lobby open → players `join` (with stable `playerKey`) and pick a color (optionally unique‑enforced via OKLab distance)
- During `prep`/`countdown` (before `running`), players can adjust stats and `spawn` once; spawning locks config
- Server clamps values to current ranges; client UI respects ranges but server remains authoritative

## Points & Standings

- Legacy `pointsTable` (index by placement) and tiered `pointsTiers` (e.g., `3x10,5x7,2x5`) supported
- Deterministic ranking and tie‑breakers: total points → best placement (lower is better) → earliest best stage → name

## Orchestrator Commands & Scene Expectations

- `loadStage(stageId)` → Opens scene (`Scene.Open(...)`) and requests RESET handshake
- `spawnMarble(player)` → Spawns marble(s) at `scene.my.spawn`, sets `_name := playerId`, applies color/physics; supports `marbleMultiplier`
- `countdown(seconds)` → Visual HUD (placeholder for Thyme overlay)
- `go()` → Removes `scene.my.startblock` to release marbles
- `resetStage(stageId)` → Reloads stage

## Emit from Algodoo (via `scene.my.sendEvent`)

- `stage.ready` when stage prepared → server moves to `prep`
- `marble.finish` per marble crossing finish → server assigns points by finish order
- Optional `stage.timeout`/`stage.reset`

## Web App Highlights

- Admin (`/admin`): Create race from discovered scenes, configure points tiers, clamp ranges, marble multiplier, auto‑advance and delays, set title, Spotify playlist, enforce unique colors
- Game (`/game`): 10‑point allocation across diameter/density/friction/restitution with mild easing within server ranges; color picking with similarity suggestions; spawn before start
- Dashboard (`/dashboard`): Standings, countdown overlays, QR to `/game`, animated point claim bursts and cheers, optional Spotify playlist embed

## Environment Variables

- `PORT` (HTTP), `MARBLERACE_COLYSEUS_PORT/HOST` (WS), `MARBLERACE_PUBLIC_HOST/URL` (reverse proxy), `MARBLERACE_ADMIN_TOKEN`, `MARBLERACE_LOG`, `ALGODOO_SERVER_LOG`

# Marble Race — Overview

Authoritative multi‑stage Marble Race, built as an `algodoo-server` plugin. Physics runs in Algodoo; orchestration and networking use Colyseus. The plugin serves three UIs: `/admin`, `/game`, `/dashboard`.

## 🧭 Navigation

- Quick Start: [quick-start.md](./quick-start.md)
- Advanced Setup: [advanced-setup.md](./advanced-setup.md)
- Architecture & Flows: [architecture.md](./architecture.md)
- Back to Docs Home: [../README.md](../README.md)

## Commands

- Build everything: `pnpm -r build`
- Run Marble Race: `pnpm run marblerace`
- Web dev for SPA only: `pnpm --filter marblerace-web run dev`

## Environment

- `PORT` (default `8080`)
- `MARBLERACE_COLYSEUS_PORT` (default `2567`)
- `MARBLERACE_ADMIN_TOKEN` (default `changeme`)
- `MARBLERACE_LOG` (`info` or `debug`)
- `ALGODOO_SERVER_LOG` (`info` or `debug`)

> Note: Keep `MARBLERACE_ADMIN_TOKEN` secret in production. The default value is for local development only.

## Source Links

- Protocol: [apps/marblerace/protocol/src/index.ts](../../apps/marblerace/protocol/src/index.ts)
- Server plugin: [apps/marblerace/server/src/plugin.ts](../../apps/marblerace/server/src/plugin.ts)
- Room: [apps/marblerace/server/src/room.ts](../../apps/marblerace/server/src/room.ts)
- Orchestrator: [apps/marblerace/server/src/orchestrator.ts](../../apps/marblerace/server/src/orchestrator.ts)
- Transport: [apps/marblerace/server/src/transport.ts](../../apps/marblerace/server/src/transport.ts)
- Web entry: [apps/marblerace/web/src/main.tsx](../../apps/marblerace/web/src/main.tsx)

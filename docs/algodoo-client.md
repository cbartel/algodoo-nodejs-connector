# Algodoo File Bridge (algodoo-client)

Bridges a simple file queue (`input.txt`/`ack.txt`/`output.txt`) to the server over WebSocket.

Navigation: [Docs Home](./README.md) • Marble Race [Quick Start](./marblerace/quick-start.md) | [Advanced Setup](./marblerace/advanced-setup.md)

## Install & Run

- Build once from repo root: `pnpm -r build`
- Preferred: copy the single‑file bundle to your Algodoo directory (where the queue files live) and run there:
  - `cp packages/algodoo-client/dist/index.js /path/to/algodoo/`
  - `cd /path/to/algodoo/`
  - `node index.js`
- Or run in place with explicit file paths:
  - `INPUT=/path/to/algodoo/input.txt ACK=/path/to/algodoo/ack.txt OUTPUT=/path/to/algodoo/output.txt node packages/algodoo-client/dist/index.js`

## Environment Variables

- `SERVER_URL` (default `ws://localhost:8080/_ws`)
- `INPUT`, `ACK`, `OUTPUT` (default `./*.txt` in CWD)
- `OUTPUT_POS` (default `./output.pos`)
- `SCENES_DIR` (default `./scenes`) — published to Admin for stage selection
- `POLL_MS` (default `250`) — file polling interval
- `LOG_LEVEL` (`info` | `debug`)

## How It Works

- RESET handshake on connect
  - Writes ONLY `<lastAck+1> RESET` into `input.txt`, clears `output.txt`, resets `OUTPUT_POS`, waits for `ack.txt ≥ seq`
  - Drops any buffered commands and sends `reset.ack` to the server; server clears its queue and resets counters
- Enqueue & Ack
  - Receives `enqueue` from server → appends as a line `"SEQ CMD PARAMS"` in `input.txt` (atomic write)
  - Watches `ack.txt` to advance `lastAck` and prune inflight
- Output
  - Tails `output.txt` and forwards new lines as `{ type: 'output', payload: { seq, cmd, params } }`
- Scenes
  - Recursively scans `SCENES_DIR` for `.phn/.phz` and publishes via `client.scenes` periodically and on request

## Related Files

- Implementation: [packages/algodoo-client/src/index.ts](../packages/algodoo-client/src/index.ts)
- Marble Race Advanced Setup: [docs/marblerace/advanced-setup.md](./marblerace/advanced-setup.md)

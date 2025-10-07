# Marble Race — Advanced Setup (Algodoo + Bridge)

Detailed wiring for Algodoo, the file bridge, and scene expectations.

Navigation: [Quick Start](./quick-start.md) • [Overview](./README.md) • [Docs Home](../README.md)

## 1) Run the File Bridge (algodoo-client)

The file bridge mirrors a queue using three files in a working directory.

- Preferred: copy the single-file bundle to your Algodoo directory (where `input.txt`, `ack.txt`, and `output.txt` should live) and run it there:
  - Build once: `pnpm -r build`
  - `cp packages/algodoo-client/dist/index.js /path/to/algodoo/`
  - `cd /path/to/algodoo/`
  - `node index.js`
- Alternative: run in-place from the repo and direct paths to your Algodoo dir via env vars:
  - `INPUT=/path/to/algodoo/input.txt ACK=/path/to/algodoo/ack.txt OUTPUT=/path/to/algodoo/output.txt node packages/algodoo-client/dist/index.js`

### Environment variables (from implementation)
- `SERVER_URL` (default `ws://localhost:8080/_ws`)
- `INPUT` (default `./input.txt`), `ACK` (default `./ack.txt`), `OUTPUT` (default `./output.txt`)
- `OUTPUT_POS` (default `./output.pos`)
- `SCENES_DIR` (default `./scenes`) — recursively scanned for `.phn/.phz` and published to Admin
- `POLL_MS` (default `250`)
- `LOG_LEVEL` (`info` or `debug`)

### Handshake & flow

- On connect, performs a RESET handshake:
  - Writes ONLY `<lastAck+1> RESET` into `input.txt`, clears `output.txt`, resets `OUTPUT_POS`, and waits until Algodoo writes the same seq into `ack.txt`.
  - Drops buffered commands (fresh start) and informs server with `reset.ack` so the server clears its queue and resets counters.
- Accepts `enqueue` from server → appends to `input.txt` (atomic write) and watches `ack.txt` to trim inflight.
- Tails `output.txt` and forwards new lines as `{ seq, cmd, params }`.
- Publishes scene files from `SCENES_DIR` periodically and on request.

## 2) Attach the Thyme Bridge in Algodoo

Attach repo-root `script.thyme` to any object (e.g., a helper box) in your scene.

### Key script variables
- `_infile`, `_ackfile`, `_outfile` — defaults: `input.txt`, `ack.txt`, `output.txt`
- `_pollEvery` — poll cadence in ticks (default `15`)
- `onSpawn` — starts the sim and sets a default `scene.my.marblecount = 10` (adjust as desired)

> It defines `scene.my.sendEvent(type, params)` to append a line to `_outfile`.

Supported commands from server: `PING`, `PRINT <msg>`, `EVAL <thyme...>`, `RESET`.

## 3) Provide Scene Variables Expected by Marble Race

- `scene.my.spawn` (vector): spawn location for marbles.
- `scene.my.marblecount` (int): baseline number of marbles per player (the app multiplies via “Marble Multiplier”).
- `scene.my.startblock` (entity): barrier removed on `go()` to release marbles.

Example (Thyme):

```thyme
onSpawn = (e) => {
  Sim.running = true;
  scene.my.marblecount = 10; // or 1
  scene.my.spawn = [0.0, 5.0];
  gate = scene.addBox({ pos := scene.my.spawn + [0, -0.5]; size := [2.0, 0.1]; static := true; immortal := true; });
  scene.my.startblock = gate;
};
```

## 4) Emit Events Back to the Server

Use `scene.my.sendEvent(type, params)` from `script.thyme`.

- Stage ready:

```thyme
scene.my.sendEvent("stage.ready", ["my-stage-id"]);
```

- Marble finish (server assigns `_name := "<playerId>"` on spawned marbles):

```thyme
postStep = (e) => { scene.my.finished ? {} : { scene.my.finished = {} }; };

// Attach to finish gate
onCollide = (e) => {
  other = e.other; pid = other._name;
  scene.my.sendEvent("marble.finish", [pid]);
};
```

## 5) Start the Marble Race App

- From project root: `pnpm run marblerace`
- Open Admin: http://localhost:8080/admin (token `changeme`), Game: http://localhost:8080/game, Dashboard: http://localhost:8080/dashboard

## 6) Verify & Troubleshoot

- Admin → Refresh Scenes lists files from `SCENES_DIR`.
- `/mr/health` shows `{ ok: true, ping: { pingOk: true } }` with recent lastPingAt.
- If actions are denied, ensure token matches `MARBLERACE_ADMIN_TOKEN`.

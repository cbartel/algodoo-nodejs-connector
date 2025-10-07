# Marble Race — Quick Start (Non‑Tech)

Run a Marble Race with the ready‑made scenes in a few steps.

## ✅ You’ll Need

- Algodoo installed
- Node.js (v18+ recommended)
- This project checked out locally

## 1) Open a Ready Scene in Algodoo

Open one of the included scenes:

- `apps/marblerace/Race 1.phz`
- `apps/marblerace/Race 2.phz`

## 2) Start the Algodoo Bridge (algodoo-client)

Build once (first time):

```bash
pnpm install && pnpm -r build
```

Copy the bridge to your Algodoo folder and run it there:

```bash
cp packages/algodoo-client/dist/index.js /path/to/your/algodoo/
cd /path/to/your/algodoo/
node index.js
```

> Tip: Run `node index.js` in the same folder where `input.txt`, `ack.txt`, and `output.txt` will live. The bridge will create and use them there. Alternatively set `INPUT`, `ACK`, and `OUTPUT` env vars to full paths.

## 3) Start the Marble Race App

```bash
pnpm run marblerace
```

Open these pages:

- Admin: http://localhost:8080/admin
- Game: http://localhost:8080/game
- Dashboard: http://localhost:8080/dashboard

> Admin token: use `changeme` (default) and paste it in the Admin page.

## 4) Run Your Race

1. In Admin, click “Refresh Scenes” → you should see Race 1 and Race 2.
2. Select stage(s) and click “Create”.
3. Click “Open Lobby” so players can join at `/game`.
4. Click “Start” to load the stage; when you see “Prep”, click “Start” again for countdown.

Players at `/game` can enter a name, pick a color, adjust their marble, and press “Spawn” before the start.

## 🛠️ Troubleshooting

- Scenes not visible? Ensure `node index.js` runs inside your Algodoo folder.
- Health page: http://localhost:8080/mr/health should show `ok: true` and `pingOk: true`.
- Admin denied? Use token `changeme`.

Need more control? See the [Advanced Setup](./advanced-setup.md).

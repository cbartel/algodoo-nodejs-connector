# Algodoo Node.js Connector

Monorepo mit vier Paketen zur Kommunikation zwischen UI, WebSocket-Server und Algodoo-Host.

## Pakete

- `algodoo-server`: WebSocket-Hub mit SEQ-Verwaltung und Backpressure.
- `algodoo-client`: Datei-Bridge zum Algodoo-Host.
- `algodoo-runtime`: kleine Runtime-API für Browser/Node.
- `algodoo-cmd-dispatcher`: React-DOM Beispiel-UI.

## Entwicklung

```
pnpm install
pnpm build
```

Jedes Paket erzeugt eine einzelnes ausführbares `dist/index.js`.

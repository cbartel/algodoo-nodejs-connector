import { startServer, type ServerPlugin } from 'algodoo-server';
import marbleRacePlugin from 'marblerace-server';

const port = Number(process.env.PORT || 8080);
// Keep internal WS enabled (path defaults to '/_ws') so algodoo-client can connect.
// Colyseus runs on a separate port, so no conflict.

const raw: any = marbleRacePlugin as any;
const plugin: ServerPlugin = (raw && (raw.name || raw.handleHttp || raw.paths || raw.path)) ? raw : (raw?.default ?? raw);

console.log('[marblerace] plugin meta', { name: (plugin as any).name, keys: Object.keys(plugin as any) });
// Start marblerace plugin; algodoo-server WS handles client integration.
startServer({ port, plugins: [plugin] });

console.log(`[marblerace] server started on http://localhost:${port}`);
console.log(`  UI: /admin /game /dashboard | health: /mr/health`);

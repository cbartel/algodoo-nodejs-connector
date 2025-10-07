/** Minimal example app: hosts the cmd-dispatcher UI on the default server. */
import cmdDispatcherPlugin from 'algodoo-cmd-dispatcher';
import { startServer } from 'algodoo-server';

// Optionally allow overriding the port via env var PORT
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

startServer({ port, plugins: [cmdDispatcherPlugin] });

console.log('Example server started. UI at http://localhost:' + (port ?? 8080) + '/cmd/');


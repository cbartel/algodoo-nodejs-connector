import { startServer } from './server.js';

import type { ServerPlugin } from './server.js';
/** Entry CLI to start the server with one or more plugins. */

/** Dynamically import plugin modules by path. */
async function loadPlugins(paths: string[]): Promise<ServerPlugin[]> {
  const plugins: ServerPlugin[] = [];
  for (const p of paths) {
    const mod = await import(p);
    const plugin = (mod.default ?? mod) as ServerPlugin;
    plugins.push(plugin);
  }
  return plugins;
}

/** Main entrypoint: resolves plugins from argv and starts the server. */
async function main(): Promise<void> {
  const pluginPaths = process.argv.slice(2);
  const plugins = await loadPlugins(pluginPaths);
  startServer({ plugins });
}

main();

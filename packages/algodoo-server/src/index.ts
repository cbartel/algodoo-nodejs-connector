import { startServer, ServerPlugin } from './server.js';

async function loadPlugins(paths: string[]): Promise<ServerPlugin[]> {
  const plugins: ServerPlugin[] = [];
  for (const p of paths) {
    const mod = await import(p);
    const plugin = (mod.default ?? mod) as ServerPlugin;
    plugins.push(plugin);
  }
  return plugins;
}

async function main(): Promise<void> {
  const pluginPaths = process.argv.slice(2);
  const plugins = await loadPlugins(pluginPaths);
  startServer({ plugins });
}

main();

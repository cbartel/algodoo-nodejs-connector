# Algodoo Node.js Connector

This monorepo contains a pluggable WebSocket server and related tools to
communicate with an Algodoo instance.

## Packages

- **algodoo-server** – WebSocket server that accepts plugins.
- **algodoo-cmd-dispatcher** – plugin providing a command queue between UI and
  Algodoo.
- **algodoo-client** – file based bridge to an Algodoo host.
- **algodoo-runtime** – small runtime library for browsers or Node.js
  environments.

## Building and Testing

```
pnpm install
pnpm build
pnpm test
```

Each package emits CommonJS, ES modules and TypeScript declarations in its
`dist` folder.

## Running the server

Start the server and load the command dispatcher plugin:

```
pnpm algodoo-server algodoo-cmd-dispatcher
```

Programmatic usage:

```ts
import { startServer } from 'algodoo-server';
import { cmdDispatcherPlugin } from 'algodoo-cmd-dispatcher';

startServer({ plugins: [cmdDispatcherPlugin] });
```

## Connecting a UI

Use `algodoo-runtime` to connect to the server:

```ts
import { connect } from 'algodoo-runtime';

const runtime = connect('ws://localhost:8080', {
  onAccepted: (seq) => console.log('accepted', seq),
});

runtime.submitEval('print("hi")');
```

## Connecting Algodoo

Run the file bridge to communicate with a local Algodoo instance:

```
node packages/algodoo-client/dist/index.js
```

It writes commands to `input.txt` and reads acknowledgements from `ack.txt`.

## Plugin API

Plugins implement the `ServerPlugin` interface exported by `algodoo-server`:

```ts
interface ServerPlugin {
  name: string;
  init?(ctx: PluginContext): void;
  onConnection?(ws: WebSocket, ctx: PluginContext): void;
  onMessage?(ws: WebSocket, msg: ClientMessage, ctx: PluginContext): void;
  onClose?(ws: WebSocket, ctx: PluginContext): void;
}
```

`PluginContext` provides access to the WebSocket server, all connected clients
and helper methods `broadcast` and `send`.

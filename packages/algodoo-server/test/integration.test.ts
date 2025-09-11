import { describe, it, expect } from 'vitest';
import { startServer, ClientMessage } from '../src/server';
import { WebSocket } from 'ws';
import { AddressInfo } from 'net';
import { cmdDispatcherPlugin } from '../../algodoo-cmd-dispatcher/src/index';

function once(ws: WebSocket): Promise<ClientMessage> {
  return new Promise((resolve) =>
    ws.once('message', (d: WebSocket.RawData) =>
      resolve(JSON.parse(d.toString()) as ClientMessage)
    )
  );
}

describe('server-client roundtrip', () => {
  it('handles submit to acked', async () => {
    const wss = startServer({ port: 0, plugins: [cmdDispatcherPlugin] });
    const port = (wss.address() as AddressInfo).port;
    const url = `ws://localhost:${port}`;

    const algo = new WebSocket(url);
    await new Promise((r) => algo.once('open', r));
    algo.send(JSON.stringify({ type: 'drain', payload: { lastAck: -1, inflight: 0 } }));

    const ui = new WebSocket(url);
    await new Promise((r) => ui.once('open', r));

    ui.send(
      JSON.stringify({ type: 'submit', payload: { cmd: 'EVAL', params: 'print("hi")' } })
    );
    const accepted = await once(ui);
    expect(accepted.type).toBe('accepted');
    const enqueue = await once(algo);
    expect(enqueue.type).toBe('enqueue');
    algo.send(JSON.stringify({ type: 'drain', payload: { lastAck: enqueue.payload.seq } }));
    const acked = await once(ui);
    expect(acked.type).toBe('acked');

    wss.close();
    ui.close();
    algo.close();
  });
});

import React, { useState, useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [input, setInput] = useState('');
  const [outputs, setOutputs] = useState<{seq:number; cmd:string; params:unknown[]}[]>([]);
  const ws = useMemo(() => new WebSocket(`ws://${location.host}/_ws`), []);

  useEffect(() => {
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'output') {
          setOutputs((prev) => [...prev, msg.payload]);
        }
      } catch {}
    };
  }, [ws]);

  const send = () => {
    ws.send(
      JSON.stringify({ type: 'submit', payload: { cmd: 'EVAL', params: input } })
    );
    setInput('');
  };

  return (
    <div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={send}>Send</button>
      <div style={{marginTop: 12}}>
        <h3>Outputs</h3>
        <ul>
          {outputs.map(o => (
            <li key={o.seq}>
              <strong>{o.seq}</strong> {o.cmd} {JSON.stringify(o.params)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

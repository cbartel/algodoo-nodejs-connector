import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { connect, Runtime } from 'algodoo-runtime';

function App() {
  const [thyme, setThyme] = useState('');
  const [accepted, setAccepted] = useState<number | null>(null);
  const [acked, setAcked] = useState<number | null>(null);
  const [status, setStatus] = useState('disconnected');
  const runtime = useRef<Runtime | null>(null);

  useEffect(() => {
    runtime.current = connect('ws://localhost:8080', {
      onAccepted: (s) => setAccepted(s),
      onAcked: (s) => setAcked(s),
      onStatus: () => setStatus('connected'),
      onError: () => setStatus('error')
    });
  }, []);

  const send = async () => {
    if (!runtime.current) return;
    try {
      const res = await runtime.current.submitEval(thyme);
      setAccepted(res.seq);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      <h1>Algodoo Cmd Dispatcher</h1>
      <textarea value={thyme} onChange={(e) => setThyme(e.target.value)} rows={5} cols={40} />
      <div>
        <button onClick={send}>Send EVAL</button>
      </div>
      <div>Last accepted: {accepted}</div>
      <div>Last acked: {acked}</div>
      <div>Status: {status}</div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

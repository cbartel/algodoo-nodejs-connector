import React, { useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [input, setInput] = useState('');
  const ws = useMemo(() => new WebSocket(`ws://${location.host}`), []);

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
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

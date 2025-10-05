import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PixelProvider } from 'marblerace-ui-kit';
import Admin from './pages/Admin';
import Game from './pages/Game';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <PixelProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/admin" element={<Admin />} />
          <Route path="/game" element={<Game />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
        <BrandingBadge />
      </BrowserRouter>
    </PixelProvider>
  );
}

function BrandingBadge() {
  const loc = useLocation();
  const inGame = (loc.pathname || '').startsWith('/game');
  const base: React.CSSProperties = {
    position: 'fixed',
    background: 'rgba(15,17,21,0.9)',
    border: '3px solid #333',
    color: '#9aa',
    padding: '4px 8px',
    borderRadius: 10,
    fontSize: 11,
    lineHeight: 1,
    pointerEvents: 'none',
    boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
  };
  const style: React.CSSProperties = inGame
    ? { ...base, left: '50%', transform: 'translateX(-50%)', bottom: `calc(2px + env(safe-area-inset-bottom, 0))`, zIndex: 120 }
    : { ...base, left: 8, bottom: `calc(6px + env(safe-area-inset-bottom, 0))`, zIndex: 9999 };
  return <div style={style}>made with <span style={{ color: '#f66' }}>❤️</span> by Krise</div>;
}

createRoot(document.getElementById('root')!).render(<App />);

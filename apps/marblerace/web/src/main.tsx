import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
      </BrowserRouter>
    </PixelProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

import { PixelProvider } from 'marblerace-ui-kit';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/global.css';

import BrandingBadge from './components/BrandingBadge';
import { SoundProvider } from './context/SoundProvider';
import Admin from './pages/Admin';
import Dashboard from './pages/Dashboard';
import Game from './pages/Game';

function App() {
  return (
    <PixelProvider>
      <SoundProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/admin" element={<Admin />} />
            <Route path="/game" element={<Game />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
          <BrandingBadge />
        </BrowserRouter>
      </SoundProvider>
    </PixelProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

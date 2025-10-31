import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { AudioManager, type SoundEffect } from '../utils/audio';

interface SoundSettings {
  volume: number; // 0..1
  muted: boolean;
}

interface SoundContextValue extends SoundSettings {
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  play: (effect: SoundEffect) => void;
  unlock: () => void;
}

const DEFAULT_SETTINGS: SoundSettings = { volume: 0.7, muted: false };
const STORAGE_KEY = 'mr_sound_settings_v1';

const SoundContext = createContext<SoundContextValue>({
  ...DEFAULT_SETTINGS,
  setVolume: () => {},
  toggleMute: () => {},
  play: () => {},
  unlock: () => {},
});

function loadSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    const volume = Number(parsed?.volume);
    const muted = Boolean(parsed?.muted);
    return {
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : DEFAULT_SETTINGS.volume,
      muted,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SoundSettings>(() => loadSettings());
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const managerRef = useRef<AudioManager | null>(null);
  const pendingUnlockRef = useRef(false);

  const persist = useCallback((next: SoundSettings) => {
    setSettings(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  }, []);

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      try {
        ctxRef.current = new AudioContext();
        gainRef.current = ctxRef.current.createGain();
        gainRef.current.gain.value = settings.muted ? 0 : settings.volume;
        gainRef.current.connect(ctxRef.current.destination);
        managerRef.current = new AudioManager(ctxRef.current, gainRef.current);
      } catch {
        ctxRef.current = null;
      }
    }
    return ctxRef.current;
  }, [settings.muted, settings.volume]);

  const resumeContext = useCallback(() => {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }, [ensureContext]);

  const unlock = useCallback(() => {
    pendingUnlockRef.current = false;
    resumeContext();
  }, [resumeContext]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      if (pendingUnlockRef.current) return;
      pendingUnlockRef.current = true;
      unlock();
    };
    window.addEventListener('pointerdown', handler, { passive: true });
    window.addEventListener('keydown', handler, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [unlock]);

  useEffect(() => {
    if (managerRef.current) {
      const volume = settings.muted ? 0 : settings.volume;
      managerRef.current.updateGain(volume);
    } else if (settings.volume > 0 && !settings.muted) {
      ensureContext();
    }
  }, [settings.volume, settings.muted, ensureContext]);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    let nextMuted = settings.muted;
    if (clamped <= 0) nextMuted = true;
    else if (settings.muted) nextMuted = false;
    persist({ volume: clamped, muted: nextMuted });
  }, [persist, settings.muted]);

  const toggleMute = useCallback(() => {
    const nextMuted = !settings.muted;
    const nextVolume = !nextMuted && settings.volume <= 0 ? 0.7 : settings.volume;
    persist({ volume: Math.max(0, Math.min(1, nextVolume)), muted: nextMuted });
  }, [persist, settings.volume, settings.muted]);

  const play = useCallback((effect: SoundEffect) => {
    if (settings.muted || settings.volume <= 0) return;
    const ctx = ensureContext();
    if (!ctx) return;
    resumeContext();
    if (!managerRef.current && ctx) {
      gainRef.current = gainRef.current ?? ctx.createGain();
      managerRef.current = new AudioManager(ctx, gainRef.current);
      managerRef.current.updateGain(settings.volume);
    }
    managerRef.current?.play(effect, 1);
  }, [ensureContext, resumeContext, settings.muted, settings.volume]);

  const value = useMemo<SoundContextValue>(() => ({
    volume: settings.volume,
    muted: settings.muted,
    setVolume,
    toggleMute,
    play,
    unlock,
  }), [settings.volume, settings.muted, setVolume, toggleMute, play, unlock]);

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  return useContext(SoundContext);
}

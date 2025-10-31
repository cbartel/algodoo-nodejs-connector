type OscillatorKind = OscillatorType | 'noise';

interface PatternStep {
  type: OscillatorKind;
  frequency?: number;
  duration: number;
  volume?: number;
  detune?: number;
  startOffset?: number;
  waveform?: OscillatorType;
}

export type SoundEffect =
  | 'countdown_tick'
  | 'countdown_go'
  | 'stage_transition'
  | 'reward_claim'
  | 'leaderboard'
  | 'cheer'
  | 'spawn_confirmed'
  | 'ultimate_charge'
  | 'ultimate_cast';

export class AudioManager {
  private ctx: AudioContext;
  private masterGain: GainNode;

  constructor(ctx: AudioContext, masterGain?: GainNode) {
    this.ctx = ctx;
    this.masterGain = masterGain ?? this.createMasterGain();
  }

  updateGain(volume: number) {
    this.masterGain.gain.value = volume;
  }

  play(effect: SoundEffect, gainScale = 1) {
    const time = this.ctx.currentTime;
    switch (effect) {
      case 'countdown_tick':
        this.schedule(time, gainScale, [
          { type: 'square', frequency: 880, duration: 0.08, volume: 0.6 },
          { type: 'square', frequency: 660, duration: 0.04, volume: 0.5, startOffset: 0.06 },
        ]);
        break;
      case 'countdown_go':
        this.schedule(time, gainScale, [
          { type: 'sawtooth', frequency: 220, duration: 0.18, volume: 0.5 },
          { type: 'triangle', frequency: 330, duration: 0.24, volume: 0.6, startOffset: 0.02 },
          { type: 'sawtooth', frequency: 440, duration: 0.3, volume: 0.45, startOffset: 0.05 },
        ]);
        break;
      case 'stage_transition':
        this.schedule(time, gainScale * 0.7, [
          { type: 'noise', duration: 0.18, volume: 0.4 },
          { type: 'triangle', frequency: 520, duration: 0.2, volume: 0.2, startOffset: 0.05 },
        ]);
        break;
      case 'reward_claim':
        this.schedule(time, gainScale, [
          { type: 'square', frequency: 1245, duration: 0.1, volume: 0.7 },
          { type: 'triangle', frequency: 1660, duration: 0.12, volume: 0.5, startOffset: 0.05 },
          { type: 'sawtooth', frequency: 2200, duration: 0.14, volume: 0.35, startOffset: 0.09 },
        ]);
        break;
      case 'leaderboard':
        this.schedule(time, gainScale, [
          { type: 'triangle', frequency: 660, duration: 0.18, volume: 0.45 },
          { type: 'triangle', frequency: 880, duration: 0.18, volume: 0.45, startOffset: 0.12 },
          { type: 'triangle', frequency: 1320, duration: 0.22, volume: 0.5, startOffset: 0.24 },
        ]);
        break;
      case 'cheer':
        this.schedule(time, gainScale, [
          { type: 'noise', duration: 0.12, volume: 0.3 },
          { type: 'triangle', frequency: 1040, duration: 0.14, volume: 0.35, startOffset: 0.02 },
          { type: 'square', frequency: 1560, duration: 0.16, volume: 0.4, startOffset: 0.05 },
        ]);
        break;
      case 'spawn_confirmed':
        this.schedule(time, gainScale, [
          { type: 'square', frequency: 660, duration: 0.1, volume: 0.45 },
          { type: 'triangle', frequency: 990, duration: 0.12, volume: 0.5, startOffset: 0.06 },
          { type: 'sawtooth', frequency: 1320, duration: 0.12, volume: 0.35, startOffset: 0.1 },
        ]);
        break;
      case 'ultimate_charge':
        this.schedule(time, gainScale * 0.9, [
          { type: 'triangle', frequency: 660, duration: 0.12, volume: 0.32 },
          { type: 'triangle', frequency: 880, duration: 0.12, volume: 0.36, startOffset: 0.06 },
          { type: 'triangle', frequency: 1100, duration: 0.15, volume: 0.38, startOffset: 0.12 },
          { type: 'triangle', frequency: 1320, duration: 0.22, volume: 0.42, startOffset: 0.18 },
          { type: 'sine', frequency: 1760, duration: 0.28, volume: 0.35, startOffset: 0.22 },
          { type: 'noise', duration: 0.18, volume: 0.18, startOffset: 0.02 },
        ]);
        break;
      case 'ultimate_cast':
        this.schedule(time, gainScale * 1.15, [
          { type: 'noise', duration: 0.18, volume: 0.22 },
          { type: 'triangle', frequency: 440, duration: 0.35, volume: 0.45 },
          { type: 'triangle', frequency: 660, duration: 0.38, volume: 0.48, startOffset: 0.08 },
          { type: 'square', frequency: 880, duration: 0.4, volume: 0.5, startOffset: 0.16 },
          { type: 'sine', frequency: 1320, duration: 0.52, volume: 0.46, startOffset: 0.2 },
          { type: 'triangle', frequency: 1760, duration: 0.4, volume: 0.4, startOffset: 0.28 },
          { type: 'noise', duration: 0.25, volume: 0.2, startOffset: 0.3 },
          { type: 'sine', frequency: 990, duration: 0.6, volume: 0.32, startOffset: 0.42 },
        ]);
        break;
      default:
        break;
    }
  }

  private createMasterGain(): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.value = 1;
    gain.connect(this.ctx.destination);
    return gain;
  }

  private schedule(startTime: number, gainScale: number, steps: PatternStep[]) {
    const baseGain = this.ctx.createGain();
    baseGain.gain.value = gainScale;
    baseGain.connect(this.masterGain);

    steps.forEach((step) => {
      const { type, frequency = 440, duration, volume = 1, detune = 0, startOffset = 0 } = step;
      const t0 = startTime + startOffset;
      const t1 = t0 + duration;
      if (type === 'noise') {
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * volume;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t1);
        noise.connect(gain);
        gain.connect(baseGain);
        noise.start(t0);
        noise.stop(t1);
        return;
      }

      const osc = this.ctx.createOscillator();
      osc.type = (step.waveform ?? type) as OscillatorType;
      osc.frequency.setValueAtTime(frequency, t0);
      if (detune) osc.detune.setValueAtTime(detune, t0);
      const gain = this.ctx.createGain();
      const v = Math.max(0, Math.min(1, volume));
      gain.gain.setValueAtTime(v, t0);
      gain.gain.linearRampToValueAtTime(0.0001, t1);
      osc.connect(gain);
      gain.connect(baseGain);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    });

    const cleanupTime = startTime + Math.max(...steps.map((s) => (s.startOffset ?? 0) + s.duration)) + 0.3;
    setTimeout(() => {
      try { baseGain.disconnect(); } catch { /* ignore */ }
    }, Math.max(10, (cleanupTime - this.ctx.currentTime) * 1000));
  }
}

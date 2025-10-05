import { Room, Client } from 'colyseus';
import {
  protocolVersion,
  StageConfig,
  defaultMarbleConfig,
  clamp,
  clamp01,
  StagePhase,
  defaultPointsTable,
  comparePlayers,
  AlgodooEvent,
  type MarbleConfig,
  clampRanges,
} from 'marblerace-protocol';
import { Orchestrator } from './orchestrator.js';
import { requestClientScanScenes } from './transport.js';
import { getLastScenes } from './scenes-cache.js';
import { RaceStateSchema, PlayerSchema, StageSchema, ResultSchema, PointsTierSchema, CheerSchema } from './schema.js';

type ClientData = {
  isAdmin?: boolean;
  playerId?: string;
};

const LOG_LEVEL = process.env.MARBLERACE_LOG || 'info';
const log = (...args: unknown[]) => console.log('[mr:room]', ...args);
const debug = (...args: unknown[]) => { if (LOG_LEVEL === 'debug') console.log('[mr:room]', ...args); };

/**
 * Colyseus room coordinating Marble Race game state and lifecycle.
 *
 * Responsibilities:
 * - Maintain authoritative race state (phases, players, points, ticker).
 * - Gate client actions (join, setConfig, spawn) based on current phases.
 * - Orchestrate stage transitions via the Algodoo runtime adapter.
 * - Handle incoming Algodoo events (stage.ready, marble.finish, etc.).
 */
export class RaceRoom extends Room<RaceStateSchema> {
  maxClients = 50;
  static rooms = new Set<RaceRoom>();

  private orchestrator!: Orchestrator;
  private stageTimeout?: NodeJS.Timeout;
  private countdownTimer?: NodeJS.Timeout;
  private loadingReadyFallback?: NodeJS.Timeout;
  private prepTimer?: NodeJS.Timeout;
  private postStageTimer?: NodeJS.Timeout;
  private finishOrder: string[] = []; // playerIds per stage
  private lastCheerAt: Map<string, number> = new Map();

  // Simple admin guard via env token
  // Default aligns with README; empty string disables auth (not recommended)
  private adminToken = process.env.MARBLERACE_ADMIN_TOKEN ?? 'changeme';

  onCreate(options: any) {
    this.autoDispose = false;
    log('onCreate');
    RaceRoom.rooms.add(this);
    // Initial state
    const state = new RaceStateSchema();
    state.protocolVersion = protocolVersion;
    state.title = 'Marble Race';
    state.globalPhase = 'lobby';
    state.stageIndex = -1;
    state.stagePhase = 'loading';
    // Disable stage hard timeouts by default; stages end when all points are awarded
    // or an admin manually ends/advances.
    state.perStageTimeoutMs = 0;
    state.pointsTable.push(...defaultPointsTable.map((n) => n));
    state.autoAdvance = true;
    state.lobbyOpen = false;
    state.roomId = this.roomId;
    // Initialize clamp ranges from protocol defaults
    state.ranges.radius.min = clampRanges.radius.min;
    state.ranges.radius.max = clampRanges.radius.max;
    state.ranges.density.min = clampRanges.density.min;
    state.ranges.density.max = clampRanges.density.max;
    state.ranges.friction.min = clampRanges.friction.min;
    state.ranges.friction.max = clampRanges.friction.max;
    state.ranges.restitution.min = clampRanges.restitution.min;
    state.ranges.restitution.max = clampRanges.restitution.max;
    // Ceremony defaults
    state.ceremonyActive = false;
    state.ceremonyDwellMs = 10000;
    state.ceremonyVersion = 0;
    this.setState(state);
    // Seed scenes from cache if available (client might have published before this room existed)
    try {
      const cached = getLastScenes();
      if (cached && cached.length) {
        state.scenes.splice(0, state.scenes.length);
        for (const f of cached) state.scenes.push(f);
      }
    } catch {}

    this.orchestrator = new Orchestrator({
      onEvent: (ev) => this.handleAlgodooEvent(ev),
    });
    try { this.orchestrator.setMarbleMultiplier?.(this.state.marbleMultiplier || 1.0); } catch {}
    // Ask client to scan scenes now that a room exists
    try { requestClientScanScenes(); } catch {}

    // Handshake / Client messages
    this.onMessage('handshake', (client: Client, payload: { protocolVersion: string; playerKey?: string }) => {
      debug('handshake', client.sessionId, payload?.protocolVersion);
      if (payload?.protocolVersion !== protocolVersion) {
        log('protocol-mismatch', payload?.protocolVersion, 'expected', protocolVersion);
        client.error(4000, 'protocol-mismatch');
        client.leave(1000, 'protocol-mismatch');
      }
      // If client presents a known playerKey, associate it for this session
      const key = String(payload?.playerKey || '').trim();
      if (key && this.state.players.has(key)) {
        this.getClientData(client).playerId = key;
        debug('handshake: associated playerKey', { key });
      }
    });

    this.onMessage('join', (client: Client, payload: { name: string; playerKey?: string; color?: { r: number; g: number; b: number } }) => {
      const cd = this.getClientData(client);
      // Allow join any time while lobby is open (late join)
      if (!this.state.lobbyOpen) {
        debug('join denied; lobby closed');
        return;
      }
      const requestedKey = String(payload?.playerKey || '').trim();
      const id = requestedKey || client.sessionId;
      const name = (payload?.name || 'Player').slice(0, 24);
      debug('join', id, name);
      // If enforcing unique colors and an incoming color exists, deny too-similar joins
      try {
        const cTry: any = (payload as any)?.color;
        if (this.state.enforceUniqueColors && cTry && Number.isFinite(cTry.r) && Number.isFinite(cTry.g) && Number.isFinite(cTry.b)) {
          if (this.isColorTooSimilar(cTry, id)) {
            try { client.send('color.denied', { reason: 'too-similar', conflictWith: this.findClosestColorOwner(cTry, id) }); } catch {}
            debug('join denied: color too similar');
            return;
          }
        }
      } catch {}
      if (!this.state.players.has(id)) {
        const ps = new PlayerSchema();
        ps.id = id;
        ps.name = name;
        // set defaults
        ps.config.radius = defaultMarbleConfig.radius;
        ps.config.density = defaultMarbleConfig.density;
        ps.config.friction = defaultMarbleConfig.friction;
        ps.config.restitution = defaultMarbleConfig.restitution;
        const c = (payload as any)?.color;
        const validColor = c && Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b);
        ps.config.color.r = validColor ? Math.max(0, Math.min(255, c.r|0)) : defaultMarbleConfig.color.r;
        ps.config.color.g = validColor ? Math.max(0, Math.min(255, c.g|0)) : defaultMarbleConfig.color.g;
        ps.config.color.b = validColor ? Math.max(0, Math.min(255, c.b|0)) : defaultMarbleConfig.color.b;
        this.state.players.set(id, ps);
        this.pushTicker('join', `${name} joined lobby`);
      } else {
        const ps = this.state.players.get(id)!;
        ps.name = name;
        const c = (payload as any)?.color;
        if (c && Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b)) {
          // If enforcing unique colors and incoming color is too similar, ignore update and notify
          if (this.state.enforceUniqueColors && this.isColorTooSimilar(c, id)) {
            try { client.send('color.denied', { reason: 'too-similar', conflictWith: this.findClosestColorOwner(c, id) }); } catch {}
          } else {
            ps.config.color.r = Math.max(0, Math.min(255, c.r|0));
            ps.config.color.g = Math.max(0, Math.min(255, c.g|0));
            ps.config.color.b = Math.max(0, Math.min(255, c.b|0));
          }
        }
      }
      cd.playerId = id;
    });

    this.onMessage('setConfig', (client: Client, payload: { partial: Partial<{ radius: number; density: number; friction: number; restitution: number; color: { r: number; g: number; b: number } }> }) => {
      const gp = this.state.globalPhase;
      const sp = this.state.stagePhase;
      const id = this.getClientData(client)?.playerId || client.sessionId;
      const p = this.state.players.get(id);
      if (!p) return;
      if (p.spawned) { debug('setConfig denied: already spawned'); return; }
      const src = {
        radius: p.config.radius,
        density: p.config.density,
        friction: p.config.friction,
        restitution: p.config.restitution,
        color: { r: p.config.color.r, g: p.config.color.g, b: p.config.color.b },
      } as { radius: number; density: number; friction: number; restitution: number; color: { r: number; g: number; b: number } };
      const incoming = payload?.partial ?? {};
      const apply: Partial<{ radius: number; density: number; friction: number; restitution: number; color: { r: number; g: number; b: number } }> = {};
      // Allow color pre-spawn in lobby/prep/countdown
      if (incoming.color && (gp === 'lobby' || sp === 'prep' || sp === 'countdown')) {
        if (this.state.enforceUniqueColors && this.isColorTooSimilar(incoming.color, id)) {
          try { client.send('color.denied', { reason: 'too-similar', conflictWith: this.findClosestColorOwner(incoming.color, id) }); } catch {}
        } else {
          apply.color = incoming.color;
        }
      }
      // Allow stats only during PREP in intermission
      if (sp === 'prep' && gp === 'intermission') {
        if (typeof incoming.radius === 'number') apply.radius = incoming.radius;
        if (typeof incoming.density === 'number') apply.density = incoming.density;
        if (typeof incoming.friction === 'number') apply.friction = incoming.friction;
        if (typeof incoming.restitution === 'number') apply.restitution = incoming.restitution;
      }
      // Dynamic clamp using current state ranges
      const r = this.state.ranges;
      const next: any = { ...src };
      if (apply.radius != null) next.radius = clamp(apply.radius as number, r.radius.min, r.radius.max);
      if (apply.density != null) next.density = clamp(apply.density as number, r.density.min, r.density.max);
      if (apply.friction != null) next.friction = clamp(apply.friction as number, r.friction.min, r.friction.max);
      if (apply.restitution != null) next.restitution = clamp(apply.restitution as number, r.restitution.min, r.restitution.max);
      if (apply.color) {
        next.color = { r: Math.max(0, Math.min(255, apply.color.r|0)), g: Math.max(0, Math.min(255, apply.color.g|0)), b: Math.max(0, Math.min(255, apply.color.b|0)) };
      }
      p.config.radius = next.radius;
      p.config.density = next.density;
      p.config.friction = next.friction;
      p.config.restitution = next.restitution;
      p.config.color.r = next.color.r;
      p.config.color.g = next.color.g;
      p.config.color.b = next.color.b;
    });

    // Player cheer during RUNNING (after spawn)
    this.onMessage('cheer', (client: Client, payload: { icon?: string; text?: string }) => {
      const id = this.getClientData(client)?.playerId || client.sessionId;
      const p = this.state.players.get(id);
      if (!p) return;
      if (!p.spawned) return;
      const sp = this.state.stagePhase;
      const gp = this.state.globalPhase;
      const allowed = (sp === 'running') || (sp === 'countdown') || (sp === 'stage_finished') || (gp === 'finished') || (gp === 'intermission' && sp === 'prep');
      if (!allowed) return;
      // No meaningful per-player rate limit (intentionally spam-friendly)
      try { this.lastCheerAt.set(id, Date.now()); } catch {}
      const icon = String(payload?.icon || '').slice(0, 4) || '🎉';
      const textRaw = String(payload?.text || '').slice(0, 80);
      const text = textRaw || `${p.name} cheers!`;
      const c = new CheerSchema();
      c.id = Math.floor(Math.random() * 1e9);
      c.playerId = p.id;
      c.playerName = p.name;
      c.icon = icon;
      c.text = text;
      c.color.r = p.config.color.r;
      c.color.g = p.config.color.g;
      c.color.b = p.config.color.b;
      c.ts = Date.now();
      (this.state.cheers as any).push(c);
      // Trim to avoid unbounded growth (allow more bursty fun)
      while (this.state.cheers.length > 200) this.state.cheers.shift();
    });

    // Admin messages
    this.onMessage('admin', (client: Client, payload: { token?: string; action: string; data?: any }) => {
      const { token, action, data } = payload || {};
      if (this.adminToken && token !== this.adminToken) {
        // Surface denial at info level and notify client
        log('admin denied: bad token');
        try { client.send('admin.denied', { reason: 'bad token' }); } catch {}
        return;
      }
      log('admin action', action);
      this.getClientData(client).isAdmin = true;
      switch (action) {
        case 'createRace':
          this.createRace(data);
          break;
        case 'endStageNow': {
          // Admin forces the current stage to end regardless of remaining points
          if (this.state.stageIndex >= 0 && this.state.stagePhase !== 'stage_finished') {
            this.pushTicker('admin', 'Stage ended by admin');
            this.endStage(false);
          } else {
            debug('endStageNow ignored: no active stage or already finished');
          }
          break;
        }
        case 'openLobby':
          this.state.lobbyOpen = true;
          this.pushTicker('lobby', 'Lobby opened');
          break;
        case 'lockLobby':
          this.state.lobbyOpen = false;
          this.pushTicker('lobby', 'Lobby locked');
          break;
        case 'start':
          // If we haven't started (stageIndex < 0), start first race loading.
          // If we're between stages (intermission) and in prep, begin countdown.
          if (this.state.stageIndex < 0 && this.state.globalPhase === 'lobby') {
            this.startRace();
          } else if (this.state.stageIndex >= 0 && this.state.globalPhase === 'intermission') {
            if (this.state.stagePhase === 'prep') {
              this.beginCountdown(10);
            } else {
              debug('start ignored: stage not in prep');
            }
          }
          break;
        case 'reset':
          this.resetRace();
          break;
        case 'finish':
          this.finishRace();
          break;
        case 'startCeremony': {
          const dwellMsRaw = (data?.ms != null) ? Number(data.ms) : ((data?.seconds != null) ? Math.round(Number(data.seconds) * 1000) : this.state.ceremonyDwellMs);
          const dwell = Math.max(300, Math.min(60 * 1000, dwellMsRaw | 0));
          this.state.ceremonyDwellMs = dwell;
          this.state.ceremonyActive = true;
          this.state.ceremonyVersion = (this.state.ceremonyVersion | 0) + 1;
          this.pushTicker('ceremony', `Award ceremony started (dwell ${Math.round(dwell/100)/10}s)`);
          break;
        }
        case 'stopCeremony': {
          this.state.ceremonyActive = false;
          this.pushTicker('ceremony', 'Award ceremony stopped');
          break;
        }
        case 'nextStage':
          this.advanceStage();
          break;
        case 'setAutoAdvance':
          this.state.autoAdvance = !!data?.auto;
          break;
        case 'setPrepTimeout': {
          const seconds = Number((data?.seconds ?? data?.ms ?? 60));
          const ms = Math.max(0, Math.min(60 * 60 * 1000, (data?.ms != null ? Number(data.ms) : Math.round(seconds * 1000))));
          this.state.perPrepTimeoutMs = ms | 0;
          this.pushTicker('prep', `Prep limit set: ${Math.ceil(this.state.perPrepTimeoutMs/1000)}s`);
          // If currently in prep, restart timer with new limit
          if (this.state.stagePhase === 'prep') this.startPrepTimer();
          break;
        }
        case 'scanScenes':
          // Ask Algodoo client to scan and publish scenes immediately
          requestClientScanScenes();
          this.pushTicker('scenes', 'Requested scene scan');
          break;
        case 'setAutoAdvanceDelay': {
          const seconds = Number((data?.seconds ?? data?.ms ?? 15));
          const ms = Math.max(0, Math.min(60 * 60 * 1000, (data?.ms != null ? Number(data.ms) : Math.round(seconds * 1000))));
          this.state.perPostStageDelayMs = ms | 0;
          this.pushTicker('stage', `Auto-advance delay set: ${Math.ceil(this.state.perPostStageDelayMs/1000)}s`);
          if (this.state.stagePhase === 'stage_finished' && this.state.autoAdvance) this.startPostStageTimer();
          break;
        }
        case 'setSpotifyPlaylist': {
          const raw = String(data?.id ?? '').trim();
          let id = '';
          if (raw) {
            // Accept full URLs, URIs, or plain IDs
            const m1 = raw.match(/playlist\/(\w{10,})/i);
            const m2 = raw.match(/spotify:playlist:([A-Za-z0-9]{10,})/i);
            if (m1) id = m1[1];
            else if (m2) id = m2[1];
            else if (/^[A-Za-z0-9]+$/.test(raw)) id = raw; // base62 id
          }
          this.state.spotifyPlaylistId = id;
          this.pushTicker('music', id ? `Playlist set (${id.slice(0,8)}…)` : 'Playlist cleared');
          break;
        }
        case 'setEnforceUniqueColors': {
          (this.state as any).enforceUniqueColors = !!data?.enforce;
          this.pushTicker('colors', `Unique colors enforcement: ${this.state.enforceUniqueColors ? 'ON' : 'OFF'}`);
          break;
        }
        case 'setTitle': {
          const raw = String((data?.title ?? '')).slice(0, 80);
          const next = raw.trim() || 'Marble Race';
          this.state.title = next;
          this.pushTicker('title', `Title set: ${next}`);
          break;
        }
        case 'setMarbleMultiplier': {
          const raw = Number((data?.value));
          let v = Number.isFinite(raw) ? raw : 1.0;
          v = Math.max(0.5, Math.min(4.0, Math.round(v * 2) / 2)); // 0.5 steps in [0.5,4]
          this.state.marbleMultiplier = v;
          try { this.orchestrator.setMarbleMultiplier?.(v); } catch {}
          this.pushTicker('marbles', `Multiplier set: x${v.toFixed(1)}`);
          break;
        }
        case 'setClampRanges': {
          // Allow editing ranges any time; server clamps player updates accordingly
          const dataAny = (data || {}) as any;
          const toPair = (v: any, defMin: number, defMax: number, hardMin: number, hardMax: number) => {
            const min = Number(v?.min);
            const max = Number(v?.max);
            let mn = Number.isFinite(min) ? min : defMin;
            let mx = Number.isFinite(max) ? max : defMax;
            if (mx < mn) [mn, mx] = [mx, mn];
            mn = Math.max(hardMin, Math.min(hardMax, mn));
            mx = Math.max(hardMin, Math.min(hardMax, mx));
            if (mx < mn) mx = mn;
            return { min: mn, max: mx };
          };
          const curr = this.state.ranges;
          const radius = ('radius' in dataAny) ? toPair(dataAny.radius, curr.radius.min, curr.radius.max, 0.001, 1.0) : { min: curr.radius.min, max: curr.radius.max };
          const density = ('density' in dataAny) ? toPair(dataAny.density, curr.density.min, curr.density.max, 0.1, 20.0) : { min: curr.density.min, max: curr.density.max };
          // Friction/restitution are logically [0,1]
          const friction = ('friction' in dataAny) ? toPair(dataAny.friction, curr.friction.min, curr.friction.max, 0.0, 1.0) : { min: curr.friction.min, max: curr.friction.max };
          const restitution = ('restitution' in dataAny) ? toPair(dataAny.restitution, curr.restitution.min, curr.restitution.max, 0.0, 1.0) : { min: curr.restitution.min, max: curr.restitution.max };
          this.state.ranges.radius.min = radius.min; this.state.ranges.radius.max = radius.max;
          this.state.ranges.density.min = density.min; this.state.ranges.density.max = density.max;
          this.state.ranges.friction.min = friction.min; this.state.ranges.friction.max = friction.max;
          this.state.ranges.restitution.min = restitution.min; this.state.ranges.restitution.max = restitution.max;
          // Re-clamp existing players to fit new ranges
          this.state.players.forEach((p) => {
            p.config.radius = clamp(p.config.radius, radius.min, radius.max);
            p.config.density = clamp(p.config.density, density.min, density.max);
            p.config.friction = clamp(p.config.friction, friction.min, friction.max);
            p.config.restitution = clamp(p.config.restitution, restitution.min, restitution.max);
          });
          this.pushTicker('ranges', `Updated ranges: radius [${radius.min.toFixed(3)}, ${radius.max.toFixed(3)}], density [${density.min.toFixed(1)}, ${density.max.toFixed(1)}]`);
          break;
        }
        case 'removePlayer': {
          const pid = String(data?.playerId || '').trim();
          if (!pid) break;
          const p = this.state.players.get(pid);
          const name = p?.name || pid;
          if (p) {
            try { this.state.players.delete(pid as any); } catch { (this.state.players as any)[pid] = undefined; }
            this.pushTicker('lobby', `Removed player: ${name}`);
          }
          try {
            const clients: Client[] = (this as any).clients || [];
            for (const c of clients) {
              const cd = this.getClientData(c);
              if (cd?.playerId === pid) {
                try { c.leave(4001, 'removed-by-admin'); } catch {}
              }
            }
          } catch {}
          break;
        }
      }
    });

    // Player spawn request
    this.onMessage('spawn', async (client: Client) => {
      const sp = this.state.stagePhase;
      const gp = this.state.globalPhase;
      if (!((sp === 'prep' || sp === 'countdown') && (gp === 'intermission' || gp === 'countdown'))) {
        debug('spawn denied: wrong phase', { sp, gp });
        return;
      }
      const id = this.getClientData(client)?.playerId || client.sessionId;
      const p = this.state.players.get(id);
      if (!p) { debug('spawn denied: no player'); return; }
      if (p.spawned) { debug('spawn ignored: already spawned'); return; }
      const player = {
        id: p.id,
        name: p.name,
        config: {
          radius: p.config.radius,
          density: p.config.density,
          friction: p.config.friction,
          restitution: p.config.restitution,
          color: { r: p.config.color.r, g: p.config.color.g, b: p.config.color.b },
        },
      };
      await this.orchestrator.spawnMarble(player);
      p.spawned = true;
      this.pushTicker('spawn', `${p.name} spawned`);
    });
  }

  onAuth(client: Client, options: any, request: any) {
    debug('onAuth', client.sessionId, options);
    // accept all; admin messages are gated per-message by token
    return true;
  }

  onJoin(client: Client, options: any) {
    debug('onJoin', client.sessionId);
    // late joiners receive snapshot automatically
  }

  onLeave(client: Client, consented: boolean) {
    debug('onLeave', client.sessionId, { consented });
    // keep players in roster for overall standings; do not remove
    if (!consented) {
      // Allow reconnection window to resume same session
      const cd = this.getClientData(client);
      this.allowReconnection(client, 180).then(() => {
        // Reconnected: cd remains matched via handshake as well
        debug('reconnected', client.sessionId);
      }).catch(() => {
        debug('reconnect timeout', client.sessionId);
      });
    }
  }

  onDispose() {
    RaceRoom.rooms.delete(this);
  }

  private getClientData(client: Client): ClientData {
    return (client as any)._cd || ((client as any)._cd = {});
  }

  // Color similarity enforcement helpers (OKLab distance)
  private srgbToLinear(c: number): number {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  private rgbToOKLab(r8: number, g8: number, b8: number): { L: number; A: number; B: number } {
    const r = this.srgbToLinear(r8), g = this.srgbToLinear(g8), b = this.srgbToLinear(b8);
    const l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b;
    const m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b;
    const s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    const L = 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_;
    const A = 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_;
    const B = 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_;
    return { L, A, B };
  }
  private okLabDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
    const a = this.rgbToOKLab(c1.r, c1.g, c1.b);
    const b = this.rgbToOKLab(c2.r, c2.g, c2.b);
    const dL = a.L - b.L, dA = a.A - b.A, dB = a.B - b.B;
    return Math.sqrt(dL*dL + dA*dA + dB*dB);
  }
  private isColorTooSimilar(color: { r: number; g: number; b: number }, excludePlayerId?: string, min = 0.12): boolean {
    let tooClose = false;
    this.state.players.forEach((p) => {
      if (excludePlayerId && p.id === excludePlayerId) return;
      const other = { r: p.config.color.r, g: p.config.color.g, b: p.config.color.b };
      const d = this.okLabDistance(color, other);
      if (d < min) tooClose = true;
    });
    return tooClose;
  }
  private findClosestColorOwner(color: { r: number; g: number; b: number }, excludePlayerId?: string): { id: string; name: string } | null {
    let best: { id: string; name: string } | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    this.state.players.forEach((p) => {
      if (excludePlayerId && p.id === excludePlayerId) return;
      const other = { r: p.config.color.r, g: p.config.color.g, b: p.config.color.b };
      const d = this.okLabDistance(color, other);
      if (d < bestD) { bestD = d; best = { id: p.id, name: p.name }; }
    });
    return best;
  }

  private createRace(data: { stages: StageConfig[]; pointsTable?: number[] }) {
    const stages = (data?.stages ?? []).filter((s) => s && s.id);
    if (stages.length < 1) return;
    // reset stages array
    this.state.stages.splice(0, this.state.stages.length);
    for (const s of stages) {
      const repeats = Math.max(1, Math.min(1000, Number((s as any)?.repeats ?? 1) | 0));
      for (let i = 0; i < repeats; i++) {
        const ss = new StageSchema();
        ss.id = s.id;
        ss.name = s.name ?? '';
        this.state.stages.push(ss);
      }
    }
    this.state.stageIndex = -1;
    this.state.stagePhase = 'loading';
    this.state.globalPhase = 'lobby';
    this.state.seed = '';
    // keep current perStageTimeoutMs; not set from admin
    // points table (legacy) or tiers (new)
    this.state.pointsTable.splice(0, this.state.pointsTable.length);
    (data.pointsTable && data.pointsTable.length ? data.pointsTable : defaultPointsTable).forEach((n) => this.state.pointsTable.push(n));
    // tiers
    (this.state as any).pointsTiers?.splice?.(0, (this.state as any).pointsTiers.length ?? 0);
    const tiers = Array.isArray((data as any)?.tiers) ? (data as any).tiers as Array<{ count: number; points: number }> : [];
    for (const t of tiers) {
      const tier = new PointsTierSchema();
      tier.count = Math.max(0, Math.min(1000, Number(t?.count ?? 0)) | 0);
      tier.points = Math.max(0, Math.min(100000, Number(t?.points ?? 0)) | 0);
      if (tier.count > 0 && tier.points >= 0) (this.state as any).pointsTiers?.push?.(tier);
    }
    // reset players progress
    this.state.players.forEach((p) => {
      p.totalPoints = 0;
      p.bestPlacement = 0;
      p.earliestBestStageIndex = -1;
      p.results.splice(0, p.results.length);
      p.spawned = false;
    });
    this.pushTicker('race', `Race created: ${stages.length} stage(s)`);
  }

  private startRace() {
    if (this.state.globalPhase !== 'lobby' || this.state.stages.length === 0) return;
    log('startRace');
    this.state.globalPhase = 'intermission';
    this.state.stageIndex = 0;
    this.state.stagePhase = 'loading';
    this.pushTicker('race', 'Race starting');
    const stage = this.state.stages[this.state.stageIndex];
    this.finishOrder = [];
    this.orchestrator.loadStage(stage.id);
    // Fallback: if Algodoo integration is not wired yet, auto-emit stage.ready
    if (this.loadingReadyFallback) clearTimeout(this.loadingReadyFallback);
    this.loadingReadyFallback = setTimeout(() => {
      if (this.state.stagePhase === 'loading') {
        log('fallback: auto stage.ready');
        this.handleAlgodooEvent({ type: 'stage.ready', payload: { stageId: stage.id, ts: Date.now() } as any });
      }
    }, 1000);
  }

  private resetRace() {
    log('resetRace');
    const idx = this.state.stageIndex;
    if (idx >= 0 && this.state.stages[idx]) {
      this.orchestrator.resetStage(this.state.stages[idx].id);
    }
    this.clearTimers();
    this.state.globalPhase = 'lobby';
    this.state.stagePhase = 'loading';
    this.state.stageIndex = -1;
    this.state.players.forEach((p) => { p.spawned = false; });
    this.pushTicker('race', 'Race reset');
  }

  private finishRace() {
    log('finishRace');
    this.clearTimers();
    this.state.globalPhase = 'finished';
    this.state.stagePhase = 'stage_finished';
    this.pushTicker('race', 'Race finished');
  }

  private advanceStage() {
    const next = this.state.stageIndex + 1;
    log('advanceStage ->', next);
    if (next >= this.state.stages.length) {
      this.finishRace();
      return;
    }
    // reset post-stage overlay/timer
    this.state.postStageMsRemaining = 0;
    if (this.postStageTimer) { clearTimeout(this.postStageTimer); this.postStageTimer = undefined; }
    this.state.stageIndex = next;
    this.state.stagePhase = 'loading';
    this.state.globalPhase = 'intermission';
    // Reset per-player spawned flags for the next stage
    this.state.players.forEach((p) => { p.spawned = false; });
    // Preparing next stage, race continues -> move to countdown soon
    this.finishOrder = [];
    this.pushTicker('stage', `Loading stage ${next + 1}/${this.state.stages.length}`);
    this.orchestrator.loadStage(this.state.stages[this.state.stageIndex].id);
    // Fallback if Algodoo isn't wired: auto-emit stage.ready
    if (this.loadingReadyFallback) clearTimeout(this.loadingReadyFallback);
    const stage = this.state.stages[this.state.stageIndex];
    this.loadingReadyFallback = setTimeout(() => {
      if (this.state.stagePhase === 'loading') {
        log('fallback: auto stage.ready');
        this.handleAlgodooEvent({ type: 'stage.ready', payload: { stageId: stage.id, ts: Date.now() } as any });
      }
    }, 1000);
  }

  private setStagePhase(phase: StagePhase) {
    debug('setStagePhase', this.state.stagePhase, '->', phase);
    this.state.stagePhase = phase;
    if (phase === 'prep') {
      this.startPrepTimer();
    } else {
      this.state.prepMsRemaining = 0;
      if (this.prepTimer) { clearTimeout(this.prepTimer); this.prepTimer = undefined; }
    }
  }

  // Event handling from Algodoo
  private handleAlgodooEvent(ev: AlgodooEvent) {
    log('algodooEvent', ev.type);
    if (ev.type === 'stage.ready') {
      if (this.loadingReadyFallback) { clearTimeout(this.loadingReadyFallback); this.loadingReadyFallback = undefined; }
      if (this.state.stagePhase !== 'loading') return;
      // Move to PREP; players can configure and spawn individually
      this.setStagePhase('prep');
      this.pushTicker('stage', 'Stage ready → prep');
    } else if (ev.type === 'marble.finish') {
      if (this.state.stagePhase !== 'running') return;
      const pid = ev.payload.playerId;
      // Count every finished marble; placement is global finish count
      this.finishOrder.push(pid);
      const name = this.state.players.get(pid)?.name ?? pid;
      const placement = this.finishOrder.length;
      this.pushTicker('finish', `${name} finished #${placement}`);
      const points = this.pointsForPlacement(placement);
      const p = this.state.players.get(pid);
      if (p) {
        const stageIdx = this.state.stageIndex;
        let res = p.results[stageIdx];
        if (!res) {
          res = new ResultSchema();
          res.stageIndex = stageIdx;
          res.placement = placement; // best placement so far
          res.points = 0;
          res.finishedAt = 0;
          p.results[stageIdx] = res;
        }
        // accumulate points per marble; keep best (lowest) placement
        if (!res.placement || placement < res.placement) res.placement = placement;
        res.points = (res.points | 0) + points;
        res.finishedAt = Date.now();
        p.totalPoints += points;
        if (placement && (p.bestPlacement === 0 || placement < p.bestPlacement)) {
          p.bestPlacement = placement;
          p.earliestBestStageIndex = stageIdx;
        }
      }
      // Short-circuit end only when all awardable points have been assigned
      const required = this.requiredFinishers();
      if (required > 0 && this.finishOrder.length >= required) this.endStage(false);
    } else if (ev.type === 'stage.timeout') {
      // Ignore runtime timeouts for stage conclusion. Stages end only when
      // all awardable points have been assigned, or via admin action.
      this.pushTicker('timeout', 'Stage timeout event received (ignored)');
    } else if (ev.type === 'stage.reset') {
      // no-op currently
    }
  }

  // Player action: spawn their marble during PREP or COUNTDOWN
  onMessage!: any; // keep TS quiet for decorator-like methods usage above
  protected onInitPlayerMessages() {}

  private beginCountdown(seconds: number) {
    log('countdown start', seconds, 'sec');
    this.setStagePhase('countdown');
    this.state.globalPhase = 'countdown';
    this.state.countdownMsRemaining = seconds * 1000;
    this.pushTicker('countdown', `Countdown started: ${seconds}s`);
    this.orchestrator.countdown(seconds);
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const remain = Math.max(0, seconds * 1000 - elapsed);
      this.state.countdownMsRemaining = remain;
      if (remain <= 0) {
        this.state.countdownMsRemaining = 0;
        this.startStageRun();
      } else {
        this.countdownTimer = setTimeout(tick, 100);
      }
    };
    this.countdownTimer = setTimeout(tick, 100);
  }

  private startStageRun() {
    log('startStageRun');
    // Auto-spawn any players who haven't spawned yet during countdown
    this.spawnAnyUnspawned().then(() => {}).catch(() => {});
    this.setStagePhase('running');
    this.state.globalPhase = 'running';
    this.pushTicker('stage', 'Stage running');
    this.orchestrator.go();
    // No hard timeout: stage ends when all awardable points are claimed or admin intervenes
  }

  private async spawnAnyUnspawned() {
    try {
      const toSpawn: Array<{ id: string; name: string; config: { radius: number; density: number; friction: number; restitution: number; color: { r: number; g: number; b: number } } }> = [];
      this.state.players.forEach((p) => {
        if (!p.spawned) {
          toSpawn.push({
            id: p.id,
            name: p.name,
            config: {
              radius: p.config.radius,
              density: p.config.density,
              friction: p.config.friction,
              restitution: p.config.restitution,
              color: { r: p.config.color.r, g: p.config.color.g, b: p.config.color.b },
            },
          });
          p.spawned = true;
        }
      });
      for (const pl of toSpawn) {
        await this.orchestrator.spawnMarble(pl);
        this.pushTicker('spawn', `${pl.name} spawned`);
      }
    } catch {}
  }

  private endStage(dueToTimeout: boolean) {
    log('endStage', { dueToTimeout });
    this.clearTimers();
    this.setStagePhase('stage_finished');
    const stageIdx = this.state.stageIndex;
    const players = Array.from(this.state.players.values());

    // Ensure every player has a result entry; fill DNFs with 0 without double-adding points
    const finishedSet = new Set(this.finishOrder);
    for (const p of players) {
      const existing = p.results[stageIdx];
      if (existing && (existing.placement || existing.placement === 0)) continue;
      const res = new ResultSchema();
      res.stageIndex = stageIdx;
      res.placement = finishedSet.has(p.id) ? (this.finishOrder.indexOf(p.id) + 1) : 0;
      res.points = res.placement ? this.pointsForPlacement(res.placement) : 0;
      res.finishedAt = res.placement ? Date.now() : 0;
      p.results[stageIdx] = res;
      // totalPoints is only incremented for non-finished players here (should be 0)
      if (res.points > 0) p.totalPoints += res.points; // safeguard
    }
    const top = [...players].sort((a, b) => comparePlayers(
      // transform PlayerSchema to protocol-like structure for comparator
      {
        id: a.id,
        name: a.name,
        config: {} as any,
        totalPoints: a.totalPoints,
        bestPlacement: a.bestPlacement || null,
        earliestBestStageIndex: a.earliestBestStageIndex >= 0 ? a.earliestBestStageIndex : null,
        results: [],
      },
      {
        id: b.id,
        name: b.name,
        config: {} as any,
        totalPoints: b.totalPoints,
        bestPlacement: b.bestPlacement || null,
        earliestBestStageIndex: b.earliestBestStageIndex >= 0 ? b.earliestBestStageIndex : null,
        results: [],
      }
    ))[0];
    this.pushTicker('stage', `Stage ${stageIdx + 1} finished. Leader: ${top?.name ?? '—'}`);

    if (this.state.autoAdvance) {
      this.startPostStageTimer();
    }
  }

  private clearTimers() {
    if (this.stageTimeout) clearTimeout(this.stageTimeout);
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    if (this.loadingReadyFallback) clearTimeout(this.loadingReadyFallback);
    if (this.prepTimer) clearTimeout(this.prepTimer);
    this.stageTimeout = undefined;
    this.countdownTimer = undefined;
    this.loadingReadyFallback = undefined;
    this.prepTimer = undefined;
    if (this.postStageTimer) clearTimeout(this.postStageTimer);
    this.postStageTimer = undefined;
  }

  private startPrepTimer() {
    if (this.prepTimer) { clearTimeout(this.prepTimer); this.prepTimer = undefined; }
    const total = Math.max(0, Number(this.state.perPrepTimeoutMs || 0));
    if (!total) { this.state.prepMsRemaining = 0; return; }
    this.state.prepMsRemaining = total;
    this.pushTicker('prep', `Preparation time started: ${Math.ceil(total/1000)}s`);
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const remain = Math.max(0, total - elapsed);
      this.state.prepMsRemaining = remain;
      if (this.state.stagePhase !== 'prep') { this.state.prepMsRemaining = 0; return; }
      if (remain <= 0) {
        this.state.prepMsRemaining = 0;
        // Auto-begin countdown if still in prep
        if (this.state.stagePhase === 'prep' && this.state.globalPhase === 'intermission') {
          this.beginCountdown(10);
        }
      } else {
        this.prepTimer = setTimeout(tick, 100);
      }
    };
    this.prepTimer = setTimeout(tick, 100);
  }

  private startPostStageTimer() {
    if (this.postStageTimer) { clearTimeout(this.postStageTimer); this.postStageTimer = undefined; }
    const total = Math.max(0, Number(this.state.perPostStageDelayMs || 0));
    if (!total) { this.state.postStageMsRemaining = 0; return; }
    this.state.postStageMsRemaining = total;
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const remain = Math.max(0, total - elapsed);
      this.state.postStageMsRemaining = remain;
      if (this.state.stagePhase !== 'stage_finished') { this.state.postStageMsRemaining = 0; return; }
      if (remain <= 0) {
        this.state.postStageMsRemaining = 0;
        this.advanceStage();
      } else {
        this.postStageTimer = setTimeout(tick, 100);
      }
    };
    this.postStageTimer = setTimeout(tick, 100);
  }

  pushTicker(kind: string, msg: string) {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${kind}${msg ? `: ${msg}` : ''}`;
    (this.state.ticker as any).unshift(line);
    while (this.state.ticker.length > 10) this.state.ticker.pop();
  }

  // Public entry from plugin/orchestrator to inject events originating from Algodoo runtime
  public ingestEventFromAlgodoo(ev: AlgodooEvent) {
    // Route through orchestrator to keep a single path (orchestrator -> room)
    // This ensures any future side effects in orchestrator are preserved.
    this.orchestrator.handleEvent(ev);
  }

  private pointsForPlacement(placement: number): number {
    if (placement <= 0) return 0;
    // Prefer tiered config if present
    let idx = placement;
    const ptsTiers: any[] = (this.state as any).pointsTiers || [];
    if (ptsTiers.length > 0) {
      for (let i = 0, acc = 0; i < ptsTiers.length; i++) {
        const t = ptsTiers[i];
        const from = acc + 1;
        const to = acc + (t.count | 0);
        if (idx >= from && idx <= to) return t.points | 0;
        acc = to;
      }
      return 0;
    }
    // Fallback to legacy table by placement index
    const n = this.state.pointsTable[placement - 1];
    return Number(n ?? 0) | 0;
  }

  private requiredFinishers(): number {
    const ptsTiers: any[] = (this.state as any).pointsTiers || [];
    if (ptsTiers.length > 0) {
      return ptsTiers.reduce((sum, t) => sum + ((t?.count|0) > 0 ? (t.count|0) : 0), 0);
    }
    const legacy = (this.state.pointsTable?.length ?? 0) | 0;
    if (legacy > 0) return legacy;
    // Fallback: if no config, require all spawned players to finish
    let spawned = 0;
    this.state.players.forEach((p) => { if ((p as any).spawned) spawned++; });
    return spawned || 0;
  }
}

// External integrations: update helpers callable from plugin
export function updateClientAlive(ts: number) {
  for (const room of RaceRoom.rooms) {
    room.state.clientLastAliveTs = ts;
  }
}

export function updateScenes(files: string[]) {
  for (const room of RaceRoom.rooms) {
    // replace scenes array
    room.state.scenes.splice(0, room.state.scenes.length);
    for (const f of files) room.state.scenes.push(f);
  }
}

// Broadcast an Algodoo event from plugin to all rooms via their orchestrators
export function dispatchAlgodooEvent(ev: AlgodooEvent) {
  for (const room of RaceRoom.rooms) {
    try { room.ingestEventFromAlgodoo(ev); } catch {}
  }
}

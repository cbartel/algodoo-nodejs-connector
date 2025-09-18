import { Room, Client } from 'colyseus';
import {
  protocolVersion,
  StageConfig,
  defaultMarbleConfig,
  clampConfig,
  StagePhase,
  defaultPointsTable,
  comparePlayers,
  AlgodooEvent,
} from 'marblerace-protocol';
import { Orchestrator } from './orchestrator.js';
import { RaceStateSchema, PlayerSchema, StageSchema, ResultSchema, TickerSchema } from './schema.js';

type ClientData = {
  isAdmin?: boolean;
  playerId?: string;
};

const LOG_LEVEL = process.env.MARBLERACE_LOG || 'info';
const log = (...args: unknown[]) => console.log('[mr:room]', ...args);
const debug = (...args: unknown[]) => { if (LOG_LEVEL === 'debug') console.log('[mr:room]', ...args); };

export class RaceRoom extends Room<RaceStateSchema> {
  maxClients = 50;
  static rooms = new Set<RaceRoom>();

  private orchestrator!: Orchestrator;
  private stageTimeout?: NodeJS.Timeout;
  private countdownTimer?: NodeJS.Timeout;
  private loadingReadyFallback?: NodeJS.Timeout;
  private finishOrder: string[] = []; // playerIds per stage

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
    state.globalPhase = 'lobby';
    state.stageIndex = -1;
    state.stagePhase = 'loading';
    state.perStageTimeoutMs = 120000;
    state.pointsTable.push(...defaultPointsTable.map((n) => n));
    state.autoAdvance = true;
    state.lobbyOpen = false;
    state.roomId = this.roomId;
    this.setState(state);

    this.orchestrator = new Orchestrator({
      onEvent: (ev) => this.handleAlgodooEvent(ev),
    });

    // Handshake / Client messages
    this.onMessage('handshake', (client: Client, payload: { protocolVersion: string }) => {
      debug('handshake', client.sessionId, payload?.protocolVersion);
      if (payload?.protocolVersion !== protocolVersion) {
        log('protocol-mismatch', payload?.protocolVersion, 'expected', protocolVersion);
        client.error(4000, 'protocol-mismatch');
        client.leave(1000, 'protocol-mismatch');
      }
    });

    this.onMessage('join', (client: Client, payload: { name: string }) => {
      const cd = this.getClientData(client);
      if (!this.state.lobbyOpen || this.state.globalPhase !== 'lobby') {
        debug('join denied; lobbyOpen/globalPhase', this.state.lobbyOpen, this.state.globalPhase);
        return;
      }
      const id = client.sessionId;
      const name = (payload?.name || 'Player').slice(0, 24);
      debug('join', id, name);
      if (!this.state.players.has(id)) {
        const ps = new PlayerSchema();
        ps.id = id;
        ps.name = name;
        // set defaults
        ps.config.radius = defaultMarbleConfig.radius;
        ps.config.density = defaultMarbleConfig.density;
        ps.config.friction = defaultMarbleConfig.friction;
        ps.config.restitution = defaultMarbleConfig.restitution;
        ps.config.linearDamping = defaultMarbleConfig.linearDamping;
        ps.config.angularDamping = defaultMarbleConfig.angularDamping;
        ps.config.color.r = defaultMarbleConfig.color.r;
        ps.config.color.g = defaultMarbleConfig.color.g;
        ps.config.color.b = defaultMarbleConfig.color.b;
        this.state.players.set(id, ps);
        this.pushTicker('join', `${name} joined lobby`);
      } else {
        const ps = this.state.players.get(id)!;
        ps.name = name;
      }
      cd.playerId = id;
    });

    this.onMessage('setConfig', (client: Client, payload: { partial: Partial<{ radius: number; density: number; friction: number; restitution: number; linearDamping: number; angularDamping: number; color: { r: number; g: number; b: number } }> }) => {
      // Allow only during PREP or COUNTDOWN, and only if not spawned yet
      const gp = this.state.globalPhase;
      const sp = this.state.stagePhase;
      if (!((sp === 'prep' || sp === 'countdown') && (gp === 'intermission' || gp === 'countdown'))) { debug('setConfig denied: phase'); return; }
      const id = client.sessionId;
      const p = this.state.players.get(id);
      if (!p) return;
      if (p.spawned) { debug('setConfig denied: already spawned'); return; }
      const src = {
        radius: p.config.radius,
        density: p.config.density,
        friction: p.config.friction,
        restitution: p.config.restitution,
        linearDamping: p.config.linearDamping,
        angularDamping: p.config.angularDamping,
        color: { r: p.config.color.r, g: p.config.color.g, b: p.config.color.b },
      };
      const clamped = clampConfig(payload?.partial ?? {}, src);
      p.config.radius = clamped.radius;
      p.config.density = clamped.density;
      p.config.friction = clamped.friction;
      p.config.restitution = clamped.restitution;
      p.config.linearDamping = clamped.linearDamping;
      p.config.angularDamping = clamped.angularDamping;
      p.config.color.r = clamped.color.r;
      p.config.color.g = clamped.color.g;
      p.config.color.b = clamped.color.b;
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
        case 'nextStage':
          this.advanceStage();
          break;
        case 'setAutoAdvance':
          this.state.autoAdvance = !!data?.auto;
          break;
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
      const id = client.sessionId;
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
          linearDamping: p.config.linearDamping,
          angularDamping: p.config.angularDamping,
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
  }

  onDispose() {
    RaceRoom.rooms.delete(this);
  }

  private getClientData(client: Client): ClientData {
    return (client as any)._cd || ((client as any)._cd = {});
  }

  private createRace(data: { stages: StageConfig[]; pointsTable?: number[] }) {
    const stages = (data?.stages ?? []).filter((s) => s && s.id);
    if (stages.length < 1) return;
    // reset stages array
    this.state.stages.splice(0, this.state.stages.length);
    for (const s of stages) {
      const ss = new StageSchema();
      ss.id = s.id;
      ss.name = s.name ?? '';
      this.state.stages.push(ss);
    }
    this.state.stageIndex = -1;
    this.state.stagePhase = 'loading';
    this.state.globalPhase = 'lobby';
    this.state.seed = '';
    // keep current perStageTimeoutMs; not set from admin
    // points table
    this.state.pointsTable.splice(0, this.state.pointsTable.length);
    (data.pointsTable && data.pointsTable.length ? data.pointsTable : defaultPointsTable).forEach((n) => this.state.pointsTable.push(n));
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
      if (this.finishOrder.includes(pid)) return;
      this.finishOrder.push(pid);
      const name = this.state.players.get(pid)?.name ?? pid;
      this.pushTicker('finish', `${name} finished #${this.finishOrder.length}`);
      // If all finished early, short-circuit timeout
      const activeIds = Array.from(this.state.players.keys());
      if (this.finishOrder.length >= activeIds.length) {
        this.endStage(false);
      }
    } else if (ev.type === 'stage.timeout') {
      if (this.state.stagePhase === 'running') this.endStage(true);
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
    this.setStagePhase('running');
    this.state.globalPhase = 'running';
    this.orchestrator.go();
    // Enforce timeout
    const ms = this.state.perStageTimeoutMs;
    if (ms && ms > 0) {
      this.stageTimeout = setTimeout(() => {
        this.handleAlgodooEvent({ type: 'stage.timeout', payload: { stageId: this.state.stages[this.state.stageIndex].id, ts: Date.now() } });
      }, ms);
    }
  }

  private endStage(dueToTimeout: boolean) {
    log('endStage', { dueToTimeout });
    this.clearTimers();
    this.setStagePhase('stage_finished');
    const stageIdx = this.state.stageIndex;
    const players = Array.from(this.state.players.values());
    const pointsTable = this.state.pointsTable;

    // Award points and mark DNFs
    const finishMap = new Map<string, number>();
    this.finishOrder.forEach((pid, i) => finishMap.set(pid, i + 1));

    for (const p of players) {
      const placement = finishMap.get(p.id) ?? 0;
      const points = placement ? (pointsTable[placement - 1] ?? 0) : 0;
      const res = new ResultSchema();
      res.stageIndex = stageIdx;
      res.placement = placement;
      res.points = points;
      res.finishedAt = placement ? Date.now() : 0;
      p.results[stageIdx] = res;
      p.totalPoints += points;
      if (placement && (p.bestPlacement === 0 || placement < p.bestPlacement)) {
        p.bestPlacement = placement;
        p.earliestBestStageIndex = stageIdx;
      }
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
      // small delay before moving on
      setTimeout(() => this.advanceStage(), 1500);
    }
  }

  private clearTimers() {
    if (this.stageTimeout) clearTimeout(this.stageTimeout);
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    if (this.loadingReadyFallback) clearTimeout(this.loadingReadyFallback);
    this.stageTimeout = undefined;
    this.countdownTimer = undefined;
    this.loadingReadyFallback = undefined;
  }

  pushTicker(kind: string, msg: string) {
    const item = new TickerSchema();
    item.ts = Date.now();
    item.kind = kind;
    item.msg = msg;
    this.state.ticker.unshift(item);
    while (this.state.ticker.length > 10) this.state.ticker.pop();
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
    room.pushTicker('scenes', `${files.length} scene(s) detected`);
  }
}

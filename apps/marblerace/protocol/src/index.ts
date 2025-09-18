// Protocol definitions for Marble Race

export const protocolVersion = '0.1.0';

// Minimal handshake
export type Handshake = {
  protocolVersion: string;
  roomId?: string;
};

// Race and Stage phases
export type RacePhase = 'lobby' | 'countdown' | 'running' | 'finished';
export type StagePhase = 'loading' | 'prep' | 'countdown' | 'running' | 'stage_finished';

// Clamp ranges for marble parameters (authoritative on server)
export const clampRanges = {
  // Adjusted to support smaller marbles (meters)
  radius: { min: 0.02, max: 0.035 },
  density: { min: 0.5, max: 4.0 },
  friction: { min: 0.0, max: 1.0 },
  restitution: { min: 0.0, max: 1.0 },
  linearDamping: { min: 0.0, max: 2.0 },
  angularDamping: { min: 0.0, max: 2.0 },
};

export type RGB = { r: number; g: number; b: number };

export function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function isValidRGB(c: RGB): boolean {
  return [c.r, c.g, c.b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255);
}

export type MarbleConfig = {
  radius: number;
  density: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  color: RGB;
};

export type PartialMarbleConfig = Partial<MarbleConfig>;

export function clampConfig(input: PartialMarbleConfig, base: MarbleConfig): MarbleConfig {
  const r = clampRanges;
  return {
    radius: clamp(input.radius ?? base.radius, r.radius.min, r.radius.max),
    density: clamp(input.density ?? base.density, r.density.min, r.density.max),
    friction: clamp01(input.friction ?? base.friction),
    restitution: clamp01(input.restitution ?? base.restitution),
    linearDamping: clamp(input.linearDamping ?? base.linearDamping, r.linearDamping.min, r.linearDamping.max),
    angularDamping: clamp(input.angularDamping ?? base.angularDamping, r.angularDamping.min, r.angularDamping.max),
    color: isValidRGB(input.color ?? base.color) ? (input.color ?? base.color) : base.color,
  };
}

export const defaultMarbleConfig: MarbleConfig = {
  radius: 0.03,
  density: 1.0,
  friction: 0.3,
  restitution: 0.25,
  linearDamping: 0.1,
  angularDamping: 0.1,
  color: { r: 255, g: 255, b: 255 },
};

// Points table: index 0 -> 1st place points
export type PointsTable = number[];
export const defaultPointsTable: PointsTable = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export type StageConfig = {
  id: string; // maps to Algodoo scene identifier
  name?: string;
};

export type PlayerId = string;

export type Player = {
  id: PlayerId;
  name: string;
  config: MarbleConfig;
  totalPoints: number;
  // Tie-break helpers
  bestPlacement: number | null; // lowest number is best (1 means 1st)
  earliestBestStageIndex: number | null; // where bestPlacement occurred first
  // Per-stage results by stage index
  results: Array<StageResult | undefined>;
};

export type StageResult = {
  stageIndex: number;
  placement?: number; // 1-based finishing order; undefined => DNF
  points: number; // awarded for this stage
  finishedAt?: number; // ms timestamp for auditing
};

export type RaceState = {
  protocolVersion: string;
  globalPhase: RacePhase;
  stages: StageConfig[];
  stageIndex: number; // -1 in lobby before first stage
  stagePhase: StagePhase;
  seed?: string;
  perStageTimeoutMs: number;
  pointsTable: PointsTable;
  autoAdvance: boolean;
  lobbyOpen: boolean;
  players: Record<PlayerId, Player>;
  // Small rolling events ticker for dashboard (most recent first)
  ticker: Array<{ ts: number; kind: string; msg: string }>;
  countdownMsRemaining?: number; // for countdown phases
  roomId?: string; // exposed to clients for QR deep-link
};

// Client/player messages
export type ClientMsg =
  | { type: 'handshake'; payload: Handshake }
  | { type: 'join'; payload: { name: string } }
  | { type: 'setConfig'; payload: { partial: PartialMarbleConfig } };

// Admin actions (must be authorized by server)
export type AdminMsg =
  | { type: 'admin/createRace'; payload: { stages: StageConfig[]; seed?: string; perStageTimeoutMs: number; pointsTable?: PointsTable } }
  | { type: 'admin/openLobby' }
  | { type: 'admin/lockLobby' }
  | { type: 'admin/start' }
  | { type: 'admin/reset' }
  | { type: 'admin/finish' }
  | { type: 'admin/nextStage' }
  | { type: 'admin/setAutoAdvance'; payload: { auto: boolean } };

export type AnyIncoming = ClientMsg | AdminMsg;

// Algodoo orchestration contracts
// Commands the server intends to send to Algodoo runtime
export type AlgodooCommand =
  | { type: 'loadStage'; payload: { stageId: string } }
  | { type: 'spawnMarbles'; payload: { players: Array<{ id: PlayerId; name: string; config: MarbleConfig }> } }
  | { type: 'countdown'; payload: { seconds: number } }
  | { type: 'go' }
  | { type: 'resetStage' };

// Events the server expects to receive from Algodoo
export type AlgodooEvent =
  | { type: 'stage.ready'; payload: { stageId: string } }
  | { type: 'marble.finish'; payload: { playerId: PlayerId; order: number; ts: number } }
  | { type: 'stage.timeout'; payload: { stageId: string; ts: number } }
  | { type: 'stage.reset'; payload: { stageId: string } };

export const Ticker = {
  info(kind: string, msg: string) {
    return { ts: Date.now(), kind, msg } as const;
  },
};

// Deterministic ranking comparator
export function comparePlayers(a: Player, b: Player): number {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  const aBest = a.bestPlacement ?? Number.POSITIVE_INFINITY;
  const bBest = b.bestPlacement ?? Number.POSITIVE_INFINITY;
  if (aBest !== bBest) return aBest - bBest; // lower is better
  const aIdx = a.earliestBestStageIndex ?? Number.POSITIVE_INFINITY;
  const bIdx = b.earliestBestStageIndex ?? Number.POSITIVE_INFINITY;
  if (aIdx !== bIdx) return aIdx - bIdx; // earlier stage wins tie
  // final fallback: lexical by name to keep deterministic order
  return a.name.localeCompare(b.name);
}

export function emptyRaceState(): RaceState {
  return {
    protocolVersion,
    globalPhase: 'lobby',
    stages: [],
    stageIndex: -1,
    stagePhase: 'loading',
    perStageTimeoutMs: 120000,
    pointsTable: defaultPointsTable,
    autoAdvance: true,
    lobbyOpen: false,
    players: {},
    ticker: [],
  };
}

export function stageCount(state: RaceState): number {
  return state.stages.length;
}

export function pushTicker(state: RaceState, kind: string, msg: string, max = 10) {
  state.ticker.unshift(Ticker.info(kind, msg));
  state.ticker = state.ticker.slice(0, max);
}

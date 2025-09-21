// Protocol definitions for Marble Race

export const protocolVersion = '0.1.0';

// Minimal handshake
export type Handshake = {
  protocolVersion: string;
  roomId?: string;
  playerKey?: string; // stable client identity for reconnection
};

// Race and Stage phases
export type RacePhase = 'lobby' | 'countdown' | 'running' | 'finished';
export type StagePhase = 'loading' | 'prep' | 'countdown' | 'running' | 'stage_finished';

// Clamp ranges for marble parameters (authoritative on server)
export const clampRanges = {
  // Adjusted to support smaller marbles (meters)
  radius: { min: 0.02, max: 0.045 },
  density: { min: 0.5, max: 4.0 },
  friction: { min: 0.0, max: 1.0 },
  restitution: { min: 0.0, max: 1.0 },
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
    color: isValidRGB(input.color ?? base.color) ? (input.color ?? base.color) : base.color,
  };
}

export const defaultMarbleConfig: MarbleConfig = {
  // default to midpoint of clamp ranges
  radius: (clampRanges.radius.min + clampRanges.radius.max) / 2, // 0.0325 with current ranges
  density: (clampRanges.density.min + clampRanges.density.max) / 2, // 2.25
  friction: 0.5,
  restitution: 0.5,
  color: { r: 255, g: 255, b: 255 },
};

// Points table: index 0 -> 1st place points
export type PointsTable = number[]; // legacy per-placement points table
export const defaultPointsTable: PointsTable = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

// New tiered points configuration: apply in order; e.g.
// [{ count: 3, points: 10 }, { count: 5, points: 7 }, { count: 2, points: 5 }]
// → placements 1..3 get 10; 4..8 get 7; 9..10 get 5; others 0.
export type PointsTier = { count: number; points: number };
export type PointsConfig = PointsTier[];

export type StageConfig = {
  id: string; // maps to Algodoo scene identifier
  name?: string;
  // Optional number of times to run this stage consecutively during the race setup.
  // Server may expand this into repeated entries; default is 1.
  repeats?: number;
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
  // Small rolling events ticker for dashboard (most recent first); plain strings
  ticker: string[];
  countdownMsRemaining?: number; // for countdown phases
  roomId?: string; // exposed to clients for QR deep-link
};

// Client/player messages
export type ClientMsg =
  | { type: 'handshake'; payload: Handshake }
  | { type: 'join'; payload: { name: string; color?: RGB } }
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
  | { type: 'admin/setAutoAdvance'; payload: { auto: boolean } }
  | { type: 'admin/removePlayer'; payload: { playerId: string } }
  | { type: 'admin/setPrepTimeout'; payload: { seconds?: number; ms?: number } }
  | { type: 'admin/setAutoAdvanceDelay'; payload: { seconds?: number; ms?: number } };

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

// Simple formatter for ticker lines (clients may format their own if needed)
export function formatTicker(kind: string, msg: string, ts = Date.now()): string {
  const time = new Date(ts).toLocaleTimeString();
  return `[${time}] ${kind}${msg ? `: ${msg}` : ''}`;
}

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
  state.ticker.unshift(formatTicker(kind, msg));
  state.ticker = state.ticker.slice(0, max);
}

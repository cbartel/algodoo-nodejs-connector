import { Schema, type as colyseusType, MapSchema, ArraySchema } from '@colyseus/schema';
/**
 * Colyseus schema definitions for Marble Race state.
 * Keep fields minimal and serializable. Client code observes these via Colyseus.
 */

/** sRGB color, 8-bit per channel. */
export class RGBSchema extends Schema {
  @colyseusType('uint8') r = 255;
  @colyseusType('uint8') g = 255;
  @colyseusType('uint8') b = 255;
}

/** Physical and visual config for a single marble. */
export class ConfigSchema extends Schema {
  @colyseusType('number') radius = 0.0325; // midpoint of [0.02, 0.045]
  @colyseusType('number') density = 2.25;  // midpoint of [0.5, 4.0]
  @colyseusType('number') friction = 0.5;  // midpoint of [0, 1]
  @colyseusType('number') restitution = 0.5; // midpoint of [0, 1]
  @colyseusType(RGBSchema) color = new RGBSchema();
}

/** Stage descriptor (scene id + optional display name). */
export class StageSchema extends Schema {
  @colyseusType('string') id = '';
  @colyseusType('string') name = '';
}

/** Per-stage result for a player. */
export class ResultSchema extends Schema {
  @colyseusType('int16') stageIndex = -1;
  @colyseusType('int16') placement = 0; // 0 => DNF
  @colyseusType('int32') points = 0;
  @colyseusType('number') finishedAt = 0; // 0 => undefined
}

/** Tiered points configuration (count finishers, points per finisher). */
export class PointsTierSchema extends Schema {
  @colyseusType('int16') count = 0;   // how many finishers get this tier
  @colyseusType('int16') points = 0;  // points awarded per finisher in this tier
}

/** Player roster entry tracked in server state. */
export class PlayerSchema extends Schema {
  @colyseusType('string') id = '';
  @colyseusType('string') name = '';
  @colyseusType(ConfigSchema) config = new ConfigSchema();
  @colyseusType('boolean') spawned = false;
  @colyseusType('int32') totalPoints = 0;
  @colyseusType('int16') bestPlacement = 0; // 0 => none
  @colyseusType('int16') earliestBestStageIndex = -1;
  @colyseusType([ResultSchema]) results = new ArraySchema<ResultSchema>();
}

// Simplified ticker: plain strings for robustness

/**
 * Root room state for clients.
 * Includes ticker and ceremony controls used by dashboards.
 */
export class RaceStateSchema extends Schema {
  @colyseusType('string') protocolVersion = '';
  @colyseusType('string') title = 'Marble Race';
  @colyseusType('string') globalPhase: 'lobby' | 'intermission' | 'countdown' | 'running' | 'finished' = 'lobby';
  @colyseusType([StageSchema]) stages = new ArraySchema<StageSchema>();
  @colyseusType('int16') stageIndex = -1;
  @colyseusType('string') stagePhase: 'loading' | 'prep' | 'countdown' | 'running' | 'stage_finished' = 'loading';
  @colyseusType('string') seed = '';
  @colyseusType('int32') perStageTimeoutMs = 120000;
  @colyseusType('int32') perPrepTimeoutMs = 60000;
  // Legacy per-placement table for backward compatibility
  @colyseusType(['int16']) pointsTable = new ArraySchema<number>();
  // New tiered points configuration
  @colyseusType([PointsTierSchema]) pointsTiers = new ArraySchema<PointsTierSchema>();
  @colyseusType('boolean') autoAdvance = true;
  @colyseusType('boolean') lobbyOpen = false;
  @colyseusType({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @colyseusType(['string']) ticker = new ArraySchema<string>();
  @colyseusType('int32') countdownMsRemaining = 0; // 0 => undefined
  @colyseusType('int32') prepMsRemaining = 0; // 0 => none or not running
  @colyseusType('int32') perPostStageDelayMs = 15000;
  @colyseusType('int32') postStageMsRemaining = 0;
  @colyseusType('string') roomId = '';
  @colyseusType('boolean') enforceUniqueColors = true;
  // Algodoo client integration
  @colyseusType('number') clientLastAliveTs = 0; // 0 => unknown
  @colyseusType(['string']) scenes = new ArraySchema<string>(); // flattened relative paths like "subdir/file.phn"
  // Award ceremony controls (admin-triggered)
  @colyseusType('boolean') ceremonyActive = false; // dashboards start ceremony when true
  @colyseusType('int32') ceremonyDwellMs = 10000;  // per-player dwell ms (winner may linger longer client-side)
  @colyseusType('int32') ceremonyVersion = 0;      // increment to retrigger ceremony across dashboards
}

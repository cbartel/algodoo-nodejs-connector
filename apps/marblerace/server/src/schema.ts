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
  @colyseusType('number') radius = 0.03;     // midpoint of [0.02, 0.04]
  @colyseusType('number') density = 2.25;    // midpoint of [0.5, 4.0]
  @colyseusType('number') friction = 0.15;   // midpoint of [0.0, 0.3]
  @colyseusType('number') restitution = 0.375; // midpoint of [0.25, 0.5]
  @colyseusType(RGBSchema) color = new RGBSchema();
}

/** Clamp range for a single numeric parameter. */
export class ClampRangeSchema extends Schema {
  @colyseusType('number') min = 0;
  @colyseusType('number') max = 1;
}

/** Grouped clamp ranges exposed to clients/admin. */
export class ClampRangesSchema extends Schema {
  @colyseusType(ClampRangeSchema) radius = new ClampRangeSchema();
  @colyseusType(ClampRangeSchema) density = new ClampRangeSchema();
  @colyseusType(ClampRangeSchema) friction = new ClampRangeSchema();
  @colyseusType(ClampRangeSchema) restitution = new ClampRangeSchema();
}

/** Stage descriptor (scene id + optional display name). */
export class StageSchema extends Schema {
  @colyseusType('string') id = '';
  @colyseusType('string') name = '';
  @colyseusType('number') multiplier = 1.0;
}

/** Per-stage result for a player. */
export class ResultSchema extends Schema {
  @colyseusType('int16') stageIndex = -1;
  @colyseusType('int16') placement = 0; // 0 => DNF
  @colyseusType('number') points = 0;
  @colyseusType('number') finishedAt = 0; // 0 => undefined
}

/** Lightweight cheer event broadcast to dashboards. */
export class CheerSchema extends Schema {
  @colyseusType('int32') id = 0;
  @colyseusType('string') playerId = '';
  @colyseusType('string') playerName = '';
  @colyseusType('string') icon = '';
  @colyseusType('string') text = '';
  @colyseusType(RGBSchema) color = new RGBSchema();
  @colyseusType('number') ts = 0;
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
  @colyseusType('string') abilityId: 'extra_spawn' = 'extra_spawn';
  @colyseusType('number') abilityCharge = 0;
  @colyseusType('number') abilityChargeFactor = 1;
  @colyseusType('boolean') extraSpawnActive = false;
  @colyseusType('number') totalPoints = 0;
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
  @colyseusType('number') marbleMultiplier = 1.0; // 0.5..4.0 in 0.5 steps
  // Runtime-adjustable clamp ranges for marble parameters
  @colyseusType(ClampRangesSchema) ranges = new ClampRangesSchema();
  // Algodoo client integration
  @colyseusType('number') clientLastAliveTs = 0; // 0 => unknown
  @colyseusType(['string']) scenes = new ArraySchema<string>(); // flattened relative paths like "subdir/file.phn"
  // Award ceremony controls (admin-triggered)
  @colyseusType('boolean') ceremonyActive = false; // dashboards start ceremony when true
  @colyseusType('int32') ceremonyDwellMs = 10000;  // per-player dwell ms (winner may linger longer client-side)
  @colyseusType('int32') ceremonyVersion = 0;      // increment to retrigger ceremony across dashboards
  // Optional Spotify playlist to embed on dashboards (default provided)
  @colyseusType('string') spotifyPlaylistId = '0j4CafKm9tDRwuk56IrGXV';
  // Ephemeral cheers from players during running
  @colyseusType([CheerSchema]) cheers = new ArraySchema<CheerSchema>();
}

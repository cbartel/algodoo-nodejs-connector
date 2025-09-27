import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

export class RGBSchema extends Schema {
  @type('uint8') r = 255;
  @type('uint8') g = 255;
  @type('uint8') b = 255;
}

export class ConfigSchema extends Schema {
  @type('number') radius = 0.0325; // midpoint of [0.02, 0.045]
  @type('number') density = 2.25;  // midpoint of [0.5, 4.0]
  @type('number') friction = 0.5;  // midpoint of [0, 1]
  @type('number') restitution = 0.5; // midpoint of [0, 1]
  @type(RGBSchema) color = new RGBSchema();
}

export class StageSchema extends Schema {
  @type('string') id = '';
  @type('string') name = '';
}

export class ResultSchema extends Schema {
  @type('int16') stageIndex = -1;
  @type('int16') placement = 0; // 0 => DNF
  @type('int32') points = 0;
  @type('number') finishedAt = 0; // 0 => undefined
}

export class PointsTierSchema extends Schema {
  @type('int16') count = 0;   // how many finishers get this tier
  @type('int16') points = 0;  // points awarded per finisher in this tier
}

export class PlayerSchema extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type(ConfigSchema) config = new ConfigSchema();
  @type('boolean') spawned = false;
  @type('int32') totalPoints = 0;
  @type('int16') bestPlacement = 0; // 0 => none
  @type('int16') earliestBestStageIndex = -1;
  @type([ResultSchema]) results = new ArraySchema<ResultSchema>();
}

// Simplified ticker: plain strings for robustness

export class RaceStateSchema extends Schema {
  @type('string') protocolVersion = '';
  @type('string') title = 'Marble Race';
  @type('string') globalPhase: 'lobby' | 'intermission' | 'countdown' | 'running' | 'finished' = 'lobby';
  @type([StageSchema]) stages = new ArraySchema<StageSchema>();
  @type('int16') stageIndex = -1;
  @type('string') stagePhase: 'loading' | 'prep' | 'countdown' | 'running' | 'stage_finished' = 'loading';
  @type('string') seed = '';
  @type('int32') perStageTimeoutMs = 120000;
  @type('int32') perPrepTimeoutMs = 60000;
  // Legacy per-placement table for backward compatibility
  @type(['int16']) pointsTable = new ArraySchema<number>();
  // New tiered points configuration
  @type([PointsTierSchema]) pointsTiers = new ArraySchema<PointsTierSchema>();
  @type('boolean') autoAdvance = true;
  @type('boolean') lobbyOpen = false;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type(['string']) ticker = new ArraySchema<string>();
  @type('int32') countdownMsRemaining = 0; // 0 => undefined
  @type('int32') prepMsRemaining = 0; // 0 => none or not running
  @type('int32') perPostStageDelayMs = 15000;
  @type('int32') postStageMsRemaining = 0;
  @type('string') roomId = '';
  @type('boolean') enforceUniqueColors = true;
  // Algodoo client integration
  @type('number') clientLastAliveTs = 0; // 0 => unknown
  @type(['string']) scenes = new ArraySchema<string>(); // flattened relative paths like "subdir/file.phn"
  // Award ceremony controls (admin-triggered)
  @type('boolean') ceremonyActive = false; // dashboards start ceremony when true
  @type('int32') ceremonyDwellMs = 10000;  // per-player dwell ms (winner may linger longer client-side)
  @type('int32') ceremonyVersion = 0;      // increment to retrigger ceremony across dashboards
}

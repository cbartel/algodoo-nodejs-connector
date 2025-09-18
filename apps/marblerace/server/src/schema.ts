import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

export class RGBSchema extends Schema {
  @type('uint8') r = 255;
  @type('uint8') g = 255;
  @type('uint8') b = 255;
}

export class ConfigSchema extends Schema {
  @type('number') radius = 0.03;
  @type('number') density = 1.0;
  @type('number') friction = 0.3;
  @type('number') restitution = 0.25;
  @type('number') linearDamping = 0.1;
  @type('number') angularDamping = 0.1;
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
  @type('int64') finishedAt = 0; // 0 => undefined
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

export class TickerSchema extends Schema {
  @type('int64') ts = 0;
  @type('string') kind = '';
  @type('string') msg = '';
}

export class RaceStateSchema extends Schema {
  @type('string') protocolVersion = '';
  @type('string') globalPhase: 'lobby' | 'intermission' | 'countdown' | 'running' | 'finished' = 'lobby';
  @type([StageSchema]) stages = new ArraySchema<StageSchema>();
  @type('int16') stageIndex = -1;
  @type('string') stagePhase: 'loading' | 'prep' | 'countdown' | 'running' | 'stage_finished' = 'loading';
  @type('string') seed = '';
  @type('int32') perStageTimeoutMs = 120000;
  @type(['int16']) pointsTable = new ArraySchema<number>();
  @type('boolean') autoAdvance = true;
  @type('boolean') lobbyOpen = false;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type([TickerSchema]) ticker = new ArraySchema<TickerSchema>();
  @type('int32') countdownMsRemaining = 0; // 0 => undefined
  @type('string') roomId = '';
  // Algodoo client integration
  @type('int64') clientLastAliveTs = 0; // 0 => unknown
  @type(['string']) scenes = new ArraySchema<string>(); // flattened relative paths like "subdir/file.phn"
}

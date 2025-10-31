import { submitEval, submitEvalAsync, requestClientReset } from "./transport";

import type { Player, AlgodooCommand, AlgodooEvent } from 'marblerace-protocol';

export interface OrchestratorCallbacks {
  onEvent: (ev: AlgodooEvent) => void;
}

/**
 * Orchestrator defines high-level commands sent to Algodoo and serves as the
 * adapter for events received back. Bodies are intentionally left empty for
 * Thyme integration via the existing runtime's `submitEval(thyme: string)`.
 *
 * Integration note:
 *  - When wiring the runtime, translate each method into an appropriate Thyme
 *    script and call `runtime.submitEval(...)`.
 *  - Subscribe to Algodoo events and invoke `cb.onEvent({...})` accordingly.
 */
export class Orchestrator {
  private cb: OrchestratorCallbacks;
  private log = (...args: unknown[]) => console.log('[mr:orch]', ...args);
  private marbleMultiplier = 1.0;

  constructor(cb: OrchestratorCallbacks) {
    this.cb = cb;
  }

  setMarbleMultiplier(v: number) {
    this.marbleMultiplier = v;
  }

  /**
   * loadStage: Request Algodoo to load a specific scene.
   *
   * Called when stagePhase transitions to 'loading'. Algodoo must:
   *  - Load the scene identified by `stageId`.
   *  - Prepare finish detectors and any track resets.
   *  - Emit `{ type: 'stage.ready', payload: { stageId } }` when ready for spawn.
   */
  async loadStage(stageId: string): Promise<void> {
    this.log('loadStage', stageId);
    const filename = stageId.replace(/.phz/g, '');
    await submitEvalAsync(`Scene.Open(\"${filename}\");`, { timeoutMs: 10000 });
    // After successfully opening a scene, request a transport reset so
    // algodoo-client clears input/output and restarts seq counters.
    requestClientReset();
  }

  async spawnMarble(player: Pick<Player, 'id' | 'name' | 'config'>): Promise<void> {
    this.log('spawnMarble', player.id);
    const multiplier = this.marbleMultiplier;
    const color = player.config.color;
    const r = (color.r/255).toFixed(7);
    const g = (color.g/255).toFixed(7);
    const b = (color.b/255).toFixed(7);
    const restitution = player.config.restitution.toFixed(7);
    const density = player.config.density.toFixed(7);
    const friction = player.config.friction.toFixed(7);

    const radius = player.config.radius.toFixed(7);
    const marbleMultiplier = Number.isFinite(multiplier) ? multiplier.toFixed(1) : '1.0';
    const thyme = `
    spawnMarble = (i) => {
        marble = scene.addCircle({
            restitution := ${restitution};
            killer := true;
            immortal := true;
            area := 3.1415927;
            collideSet := 63;
            drawBorder := false;
            friction := ${friction};
            color := [${r}, ${g}, ${b}, 1.0000000];
            onHitByLaser := (e)=>{};
            drawCake := false;
            pos := scene.my.spawn;
            density := ${density};
            radius := ${radius};
            _name := "${player.id}";
            layer := 0
        });
        scene.addPen({
            pos := marble.pos;
            geom := marble.geomID;
            relPoint := [0.0000000, 0.0000000];
            followGeometry := true;
            opaqueBorders := true;
            size := 0.039062500;
            color := [${r}, ${g}, ${b}, 1.0000000];
            fadeTime := 0.30000001;
            zDepth := 106.00000;
            layer := 0
        });
        eval(\"scene.temp.${player.id}\" + i + \" = marble\");
    };
    scene.my.marblecount > 1 ? {
        for(scene.my.marblecount * ${marbleMultiplier}, (i) => {
            spawnMarble(i);
        });
    } : { 
        spawnMarble(1); 
    };
    
    `
      const compact = thyme.replace(/\s+/g, ' ').trim();
      await submitEvalAsync(compact);
  }

  /**
   * countdown: Present a visible countdown overlay in Algodoo.
   *
   * Called on stagePhase 'countdown'. Algodoo must:
   *  - Show a HUD countdown for `seconds` seconds.
   *  - On completion, emit nothing (server will call `go()`).
   */
  async countdown(seconds: number): Promise<void> {
    this.log('countdown', seconds);
    void seconds;
    // TODO: submit Thyme to render countdown HUD in the scene.
  }

  /**
   * go: Start the race.
   *
   * Called after countdown completes. Algodoo must:
   *  - Release constraints / start gravity so marbles move.
   *  - For each marble that crosses the finish, emit
   *    `{ type: 'marble.finish', payload: { playerId, order, ts } }`.
   */
  async go(): Promise<void> {
    this.log('go');
    const thyme = `
        scene.removeEntity(scene.my.startblock);
    `
      const compact = thyme.replace(/\s+/g, ' ').trim();
      await submitEvalAsync(compact);
  }

  /**
   * resetStage: Reset the stage to its initial, neutral state.
   *
   * Called on admin reset or between stages. Algodoo must:
   *  - Clear all marbles and HUD overlays.
   *  - Reset track to default conditions.
   *  - Emit `{ type: 'stage.reset', payload: { stageId } }` when complete.
   */
  async resetStage(stageId: string): Promise<void> {
    this.log('resetStage', stageId);
    void stageId;
    return this.loadStage(stageId);
  }

  // Adapter entrypoint for receiving low-level events from Algodoo runtime.
  // Wire the transport to invoke this when events arrive.
  handleEvent(ev: AlgodooEvent): void {
    this.log('handleEvent', ev.type, ev.payload);
    this.cb.onEvent(ev);
  }
}

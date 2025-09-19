import type { Player, AlgodooCommand, AlgodooEvent } from 'marblerace-protocol';
import { submitEval, submitEvalAsync, requestClientReset } from "./transport";

export type OrchestratorCallbacks = {
  onEvent: (ev: AlgodooEvent) => void;
};

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

  constructor(cb: OrchestratorCallbacks) {
    this.cb = cb;
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

  /**
   * spawnMarbles: Spawn one marble per player with the server-clamped config.
   *
   * Called when transitioning to stagePhase 'ready'. Algodoo must:
   *  - Spawn marbles at the start area with specified physics parameters.
   *  - Assign a unique marker linking marble to `playerId`.
   *  - Do not start movement yet.
   */
  async spawnMarbles(players: Array<Pick<Player, 'id' | 'name' | 'config'>>): Promise<void> {
    this.log('spawnMarbles', players.length);
    void players;
    // TODO: submit Thyme to spawn marbles and tag them with player IDs.
  }

  async spawnMarble(player: Pick<Player, 'id' | 'name' | 'config'>): Promise<void> {
    this.log('spawnMarble', player.id);
    const color = player.config.color;
    const r = (color.r/255).toFixed(7);
    const g = (color.g/255).toFixed(7);
    const b = (color.b/255).toFixed(7);

    const radius = player.config.radius.toFixed(7);
    // TODO: submit Thyme to spawn a single marble tagged with player.id
    const thyme = `
    spawnMarble = () => {
        marble = scene.addCircle({
            restitution := 0.50000000;
            killer := true;
            immortal := true;
            area := 3.1415927;
            collideSet := 63;
            drawBorder := false;
            friction := 0.0000000;
            color := [${r}, ${g}, ${b}, 1.0000000];
            onHitByLaser := (e)=>{};
            drawCake := false;
            pos := scene.my.spawn;
            density := 2.0000000;
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
    };
    scene.my.marblecount > 1 ? {
        for(scene.my.marblecount, (i) => {
            spawnMarble();
        });
    } : { 
        spawnMarble(); 
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

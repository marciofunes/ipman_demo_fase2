import { BLOCK_FACES, DRILL_OPERATIONS, holeSurface } from './workpiece';
export type CyclePhase = 'load' | 'index' | 'approach' | 'cut' | 'retract' | 'complete';
export interface CycleState {
  face: number;
  phase: CyclePhase;
  p: number;
  A: number;
  B: number;
  hole: number;
  completed: number;
  total: number;
  penetration: number;
  tx: number;
  ty: number;
  z: number;
  cutting: boolean;
  parts: number;
  progress: number;
}
const SAFE_Z = 0.66;
const ease = (x: number) => x * x * (3 - 2 * x);
/** Shared material-removal and tool-motion clock. XY/AB traverse only at safe Z.
 * What-if feed controls drilling duration; table speed controls face indexing. */
export class CycleMachine {
  private phase: CyclePhase = 'load';
  private elapsed = 0;
  private hole = 0;
  parts = 0;
  private duration(cut: number, index: number) {
    if (this.phase === 'load') return 1.5;
    if (this.phase === 'complete') return 3;
    if (this.phase === 'index')
      return this.hole === 0 ||
        DRILL_OPERATIONS[this.hole - 1].face !== DRILL_OPERATIONS[this.hole].face
        ? Math.max(0.6, index)
        : 0.45;
    if (this.phase === 'cut')
      return Math.max(0.35, cut * 0.16) * (0.7 + DRILL_OPERATIONS[this.hole].radius / 0.025);
    return 0.45;
  }
  advance(dt: number, cutS: number, indexS: number): CycleState {
    let remaining = Math.max(0, Math.min(dt, 1));
    for (let guard = 0; guard < 40; guard++) {
      const duration = this.duration(cutS, indexS);
      if (this.elapsed + remaining < duration) {
        this.elapsed += remaining;
        break;
      }
      remaining -= duration - this.elapsed;
      this.elapsed = 0;
      if (this.phase === 'load') this.phase = 'index';
      else if (this.phase === 'index') this.phase = 'approach';
      else if (this.phase === 'approach') this.phase = 'cut';
      else if (this.phase === 'cut') this.phase = 'retract';
      else if (this.phase === 'retract') {
        if (this.hole === DRILL_OPERATIONS.length - 1) this.phase = 'complete';
        else {
          this.hole++;
          this.phase = 'index';
        }
      } else {
        this.parts++;
        this.hole = 0;
        this.phase = 'load';
      }
    }
    return this.state(cutS, indexS);
  }
  state(cutS: number, indexS: number): CycleState {
    const op = DRILL_OPERATIONS[this.hole],
      face = BLOCK_FACES[op.face];
    const previous = BLOCK_FACES[DRILL_OPERATIONS[Math.max(0, this.hole - 1)].face];
    const p = Math.min(1, this.elapsed / this.duration(cutS, indexS)),
      e = ease(p);
    let A = face.A,
      B = face.B;
    const [x, y, surfaceZ] = holeSurface(this.hole);
    const before = this.hole === 0 ? [0, 1.22, SAFE_Z] : holeSurface(this.hole - 1);
    let tx = x,
      ty = y,
      z = SAFE_Z,
      penetration = 0;
    if (this.phase === 'load') {
      A = 0;
      B = 0;
      tx = 0;
      ty = 1.22;
    }
    if (this.phase === 'index') {
      A = (this.hole === 0 ? 0 : previous.A) * (1 - e) + face.A * e;
      B = (this.hole === 0 ? 0 : previous.B) * (1 - e) + face.B * e;
      tx = before[0] * (1 - e) + x * e;
      ty = before[1] * (1 - e) + y * e;
    }
    if (this.phase === 'approach') z = SAFE_Z + (surfaceZ - SAFE_Z) * e;
    if (this.phase === 'cut') {
      penetration = p;
      z = surfaceZ + op.depth * p;
    }
    if (this.phase === 'retract') {
      penetration = 1;
      z = (surfaceZ + op.depth) * (1 - e) + SAFE_Z * e;
    }
    if (this.phase === 'complete') {
      A = face.A * (1 - e);
      B = face.B * (1 - e);
    }
    const completed =
      this.phase === 'load'
        ? 0
        : this.hole + (this.phase === 'retract' || this.phase === 'complete' ? 1 : 0);
    return {
      face: op.face,
      phase: this.phase,
      p,
      A,
      B,
      hole: this.hole,
      completed,
      total: DRILL_OPERATIONS.length,
      penetration,
      tx,
      ty,
      z,
      cutting: this.phase === 'cut',
      parts: this.parts,
      progress:
        this.phase === 'load'
          ? 0
          : (completed + (this.phase === 'cut' ? p : 0)) / DRILL_OPERATIONS.length,
    };
  }
}
export function indexSeconds(tableRpm: number): number {
  return Math.min(8, Math.max(0.4, 15 / Math.max(0.5, tableRpm)));
}

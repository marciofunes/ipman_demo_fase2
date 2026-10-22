/**
 * Máquina de estados do ciclo de usinagem da peça sobre a mesa giratória.
 *
 * Faces 1–4: a mesa (eixo B) gira 90° para apresentar cada face lateral ao spindle
 * horizontal; o spindle aproxima, fresa (varredura X/Y) e recua.
 * Face 5: o berço (eixo A) inclina 90° para apresentar o topo, fresa e retorna.
 *
 * Os tempos vêm do modelo what-if: avanço → tempo de corte; velocidade da mesa → tempo de indexação.
 */
export type CyclePhase = 'index' | 'approach' | 'cut' | 'retract' | 'tilt';

export interface CycleState {
  face: number; // 0..4
  phase: CyclePhase;
  /** progresso dentro da fase (0..1) */
  p: number;
  /** rotação acumulada da mesa (rad) */
  B: number;
  /** inclinação do berço (rad, 0 = horizontal, −π/2 = topo voltado ao spindle) */
  A: number;
  /** avanço do spindle em Z (0 recuado .. 1 em contato) */
  z: number;
  /** varredura da ferramenta na face (−1..1) */
  tx: number;
  ty: number;
  cutting: boolean;
  parts: number;
  /** progresso da peça (0..1) */
  progress: number;
}

const APPROACH = 0.8;
const RETRACT = 0.8;
const TILT = 1.4;

interface Step {
  face: number;
  phase: CyclePhase;
  dur: (cut: number, index: number) => number;
  tiltDir?: 1 | -1;
}

const STEPS: Step[] = [];
for (let f = 0; f < 4; f += 1) {
  STEPS.push({ face: f, phase: 'index', dur: (_c, i) => i });
  STEPS.push({ face: f, phase: 'approach', dur: () => APPROACH });
  STEPS.push({ face: f, phase: 'cut', dur: (c) => c });
  STEPS.push({ face: f, phase: 'retract', dur: () => RETRACT });
}
STEPS.push({ face: 4, phase: 'tilt', dur: () => TILT, tiltDir: 1 });
STEPS.push({ face: 4, phase: 'approach', dur: () => APPROACH });
STEPS.push({ face: 4, phase: 'cut', dur: (c) => c * 0.8 });
STEPS.push({ face: 4, phase: 'retract', dur: () => RETRACT });
STEPS.push({ face: 4, phase: 'tilt', dur: () => TILT, tiltDir: -1 });

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const HALF_PI = Math.PI / 2;

export class CycleMachine {
  private step = 0;
  private elapsed = 0;
  private indexCount = 0;
  parts = 0;

  /** avança o ciclo `dt` segundos; cutS = tempo de corte por face, indexS = tempo de indexação */
  advance(dt: number, cutS: number, indexS: number): CycleState {
    let remaining = Math.max(0, Math.min(dt, 1));
    // laço limitado: dt é sempre pequeno (quadro de animação)
    for (let guard = 0; guard < 50; guard += 1) {
      const s = STEPS[this.step];
      const d = Math.max(0.05, s.dur(cutS, indexS));
      if (this.elapsed + remaining < d) {
        this.elapsed += remaining;
        break;
      }
      remaining -= d - this.elapsed;
      this.elapsed = 0;
      if (s.phase === 'index') this.indexCount += 1;
      this.step += 1;
      if (this.step >= STEPS.length) {
        this.step = 0;
        this.parts += 1;
      }
    }
    return this.state(cutS, indexS);
  }

  state(cutS: number, indexS: number): CycleState {
    const s = STEPS[this.step];
    const d = Math.max(0.05, s.dur(cutS, indexS));
    const p = Math.min(1, this.elapsed / d);
    const e = ease(p);
    let B = this.indexCount * HALF_PI;
    if (s.phase === 'index') B += e * HALF_PI;
    let A = s.face === 4 ? -HALF_PI : 0;
    if (s.phase === 'tilt') A = s.tiltDir === 1 ? -HALF_PI * e : -HALF_PI * (1 - e);
    let z = 0;
    if (s.phase === 'approach') z = e;
    if (s.phase === 'cut') z = 1;
    if (s.phase === 'retract') z = 1 - e;
    const passes = 3;
    const tx = s.phase === 'cut' ? Math.sin(p * passes * Math.PI * 2) : 0;
    const ty = s.phase === 'cut' ? 1 - 2 * p : s.phase === 'approach' ? 1 : s.phase === 'retract' ? -1 : 0;
    let before = 0;
    let total = 0;
    STEPS.forEach((st, i) => {
      const dd = Math.max(0.05, st.dur(cutS, indexS));
      total += dd;
      if (i < this.step) before += dd;
    });
    return {
      face: s.face,
      phase: s.phase,
      p,
      B,
      A,
      z,
      tx,
      ty,
      cutting: s.phase === 'cut',
      parts: this.parts,
      progress: (before + this.elapsed) / total,
    };
  }
}

/** tempo de indexação de 90° (s) para a velocidade da mesa em rpm */
export function indexSeconds(tableRpm: number): number {
  return Math.min(8, Math.max(0.4, 15 / Math.max(0.5, tableRpm)));
}

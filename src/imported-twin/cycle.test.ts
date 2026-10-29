import { describe, expect, it } from 'vitest';
import { CycleMachine } from './twin/cycle';
import { BLOCK_FACES, DRILL_OPERATIONS, holeSurface, rotateOnTable } from './twin/workpiece';

describe('drilling the aluminium block', () => {
  it('keeps every hole inside its face and aims each face toward the spindle', () => {
    expect(DRILL_OPERATIONS).toHaveLength(42);
    for (const face of BLOCK_FACES) {
      const normal = rotateOnTable(face.normal, face.A, face.B);
      normal.forEach((v, i) => expect(v).toBeCloseTo(i === 2 ? -1 : 0, 9));
      for (const hole of face.holes) {
        expect(Math.abs(hole.u) + hole.radius).toBeLessThan(face.width / 2);
        expect(Math.abs(hole.v) + hole.radius).toBeLessThan(face.height / 2);
        for (const other of face.holes.filter((h) => h !== hole))
          expect(Math.hypot(hole.u - other.u, hole.v - other.v)).toBeGreaterThan(
            hole.radius + other.radius,
          );
      }
    }
  });

  it('drills every hole in order, retracts before indexing, and replaces the finished block', () => {
    const machine = new CycleMachine();
    const holes = new Set<number>();
    const phases = new Set<string>();
    let state = machine.advance(0, 2, 1);
    expect(state.phase).toBe('load');
    expect(state.completed).toBe(0);
    let finished = false;
    for (let frame = 0; frame < 20000 && state.parts === 0; frame++) {
      state = machine.advance(0.02, 2, 1);
      phases.add(state.phase);
      if (state.phase === 'index' || state.phase === 'complete') expect(state.z).toBe(0.66);
      if (state.cutting) {
        holes.add(state.hole);
        const [x, y, z] = holeSurface(state.hole);
        expect(state.tx).toBeCloseTo(x, 9);
        expect(state.ty).toBeCloseTo(y, 9);
        expect(state.z).toBeCloseTo(z + DRILL_OPERATIONS[state.hole].depth * state.penetration, 9);
        expect(state.completed).toBe(state.hole);
        expect(state.A).toBe(BLOCK_FACES[state.face].A);
        expect(state.B).toBe(BLOCK_FACES[state.face].B);
      }
      if (state.phase === 'complete') {
        finished = true;
        expect(state.completed).toBe(42);
        expect(state.progress).toBe(1);
      }
    }
    expect([...holes]).toEqual(DRILL_OPERATIONS.map((_, i) => i));
    expect([...phases]).toEqual(
      expect.arrayContaining(['load', 'index', 'approach', 'cut', 'retract', 'complete']),
    );
    expect(finished).toBe(true);
    expect(state.parts).toBe(1);
    expect(state.phase).toBe('load');
    expect(state.completed).toBe(0);
    expect(state.progress).toBe(0);
  });

  it('responds to feed and table speed without moving holes', () => {
    const duration = (cut: number, index: number) => {
      const machine = new CycleMachine();
      for (let i = 0; i < 30000; i++) if (machine.advance(0.02, cut, index).parts) return i;
      throw new Error('Cycle did not complete');
    };
    expect(duration(2, 1)).toBeLessThan(duration(8, 1));
    expect(duration(2, 1)).toBeLessThan(duration(2, 8));
  });
});

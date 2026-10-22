import { describe, it, expect } from 'vitest';
import {
  componentIds,
  defaultTwinScenario,
  evaluateTwin,
  conditionName,
  conditionColor,
} from './twin-engine';
describe('per-component what-if engine', () => {
  it('provides independent persistent settings for all G300 units', () => {
    const a = defaultTwinScenario();
    a.motor.imbalance = 90;
    expect(a.spindle.imbalance).toBe(0);
    expect(componentIds).toHaveLength(6);
    const b = defaultTwinScenario();
    expect(b.motor.imbalance).toBe(0);
  });
  it('raises vibration and propagates a motor fault to the spindle', () => {
    const scenario = defaultTwinScenario(),
      base = evaluateTwin(scenario, 0);
    scenario.motor.imbalance = 100;
    const fault = evaluateTwin(scenario, 0);
    expect(fault.motor.rms).toBeGreaterThan(5);
    expect(fault.spindle.rms).toBeGreaterThan(base.spindle.rms);
    expect(fault.pump3.rms).toBe(base.pump3.rms);
    expect(fault.motor.condition).toBe('Crítico');
    expect(conditionColor(fault.motor.rms)).toBe('#eb5147');
  });
  it('pump restriction changes electrical demand and mechanical condition', () => {
    const scenario = defaultTwinScenario(),
      base = evaluateTwin(scenario, 4);
    scenario.pump1.restriction = 90;
    const fault = evaluateTwin(scenario, 4);
    expect(fault.pump1.rms).toBeGreaterThan(base.pump1.rms);
    expect(fault.pump1.current).toBeGreaterThan(base.pump1.current);
    expect(fault.pump1.power).toBeGreaterThan(base.pump1.power);
    expect(fault.pump1.pf).toBeLessThan(base.pump1.pf);
    expect(fault.spindle.rms).toBeGreaterThan(base.spindle.rms);
  });
  it('keeps outputs finite and bounded for malformed inputs', () => {
    const scenario = defaultTwinScenario();
    scenario.table = { rpm: Infinity, load: NaN, imbalance: 1000, restriction: -20 };
    Object.values(evaluateTwin(scenario, 0)).forEach((r) => {
      [r.rms, r.current, r.power, r.pf, r.score].forEach((v) =>
        expect(Number.isFinite(v)).toBe(true),
      );
      expect(r.pf).toBeGreaterThanOrEqual(0.6);
      expect(r.pf).toBeLessThanOrEqual(0.99);
      expect(r.score).toBeLessThanOrEqual(100);
    });
    expect(conditionName(1)).toBe('Normal');
    expect(conditionName(3.5)).toBe('Atenção');
  });
  it('refreshes live values without modifying component parameters', () => {
    const scenario = defaultTwinScenario(),
      copy = structuredClone(scenario);
    expect(evaluateTwin(scenario, 0).spindle.rms).not.toBe(evaluateTwin(scenario, 1).spindle.rms);
    expect(scenario).toEqual(copy);
  });
});

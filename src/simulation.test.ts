import { describe, it, expect } from "vitest";
import { simulate } from "./simulation";
import { mockData } from "./data";
describe("what-if response", () => {
  it("reproduces reference operating point", () => {
    const v = simulate(mockData.simulation.defaults);
    expect(v.rms).toBeCloseTo(2.1);
    expect(v.current).toBeCloseTo(12.4);
    expect(v.power).toBeCloseTo(7.8);
    expect(v.pf).toBeCloseTo(0.92);
    expect(v.score).toBe(0);
  });
  it("increases current, power, RMS and anomaly under higher load and speed", () => {
    const base = simulate(mockData.simulation.defaults),
      high = simulate({ rpm: 11000, load: 95, table: 12 });
    for (const key of ["rms", "current", "power", "score"] as const)
      expect(high[key]).toBeGreaterThan(base[key]);
    expect(high.pf).toBeLessThan(base.pf);
  });
  it("clamps out of range and non-finite inputs and keeps physical outputs finite", () => {
    for (const input of [
      { rpm: Infinity, load: NaN, table: -30 },
      { rpm: 999999, load: 500, table: 99 },
      { rpm: -1, load: -1, table: -1 },
    ]) {
      const v = simulate(input);
      expect(v.rpm).toBeGreaterThanOrEqual(1500);
      expect(v.rpm).toBeLessThanOrEqual(12000);
      expect(v.load).toBeGreaterThanOrEqual(20);
      expect(v.table).toBeLessThanOrEqual(15);
      Object.values(v).forEach((n) => expect(Number.isFinite(n)).toBe(true));
      expect(v.score).toBeGreaterThanOrEqual(0);
      expect(v.score).toBeLessThanOrEqual(100);
      expect(v.pf).toBeGreaterThan(0);
      expect(v.pf).toBeLessThanOrEqual(1);
    }
  });
});

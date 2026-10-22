import { mockData } from "./data";
export type Scenario = { rpm: number; load: number; table: number };
// Illustrative deterministic response, NOT a calibrated machine/physics model.
// Outputs follow slides 2, 3, 12, 13: RMS, current, power, PF, anomaly score.
export function simulate(input: Scenario) {
  const { defaults: d, limits: l, baseline: b } = mockData.simulation;
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
  const rpm = clamp(input.rpm, ...(l.rpm as [number, number])),
    load = clamp(input.load, ...(l.load as [number, number])),
    table = clamp(input.table, ...(l.table as [number, number]));
  const speed = rpm / d.rpm,
    force = load / d.load;
  const rms =
    b.rms *
    (0.55 + 0.45 * speed ** 2) *
    (0.65 + 0.35 * force) *
    (1 + Math.abs(table - d.table) * 0.012);
  const current = b.current * (0.25 + 0.75 * force) * (0.8 + 0.2 * speed);
  const power = b.power * (0.2 + 0.8 * force) * (0.7 + 0.3 * speed);
  const pf = clamp(
    b.pf - 0.06 * Math.abs(force - 1) - 0.025 * Math.abs(speed - 1),
    0.6,
    0.99,
  );
  const score = clamp((rms / b.rms - 1) * 55 + (force - 1) * 15, 0, 100);
  return { rpm, load, table, rms, current, power, pf, score };
}

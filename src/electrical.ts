import { electricalSeeds, machineProfiles } from './data';
import type { AnalyticsFilters } from './analytics';

export type ElectricalReading = {
  voltage: number; current: number; power: number; reactive: number;
  apparent: number; pf: number; frequency: number;
};
export type ElectricalMetric = keyof ElectricalReading;

/** Fundamental-frequency balanced three-phase model, with inductive reactive power.
 * S = sqrt(3) U(line-line) I / 1000; P = S PF; Q = sqrt(S² - P²).
 * These are electrical seeds, independent of acceleration units and thresholds. */
export function queryElectrical(filters: AnalyticsFilters, tick: number) {
  const hours = filters.period === 'Últimos 7 dias' ? 168 : filters.period === 'Últimas 24 horas' ? 24 : 8;
  const branches = machineProfiles.flatMap((machine, index) =>
    !filters.machine || machine.name === filters.machine
      ? Object.keys(machine.sensors).map((name, assetIndex) => ({ name, index, assetIndex, machine: machine.name }))
        .filter(branch => !filters.asset || branch.name === filters.asset)
      : []);
  function readings(ageHours: number) {
    return branches.map(branch => {
      const seed = electricalSeeds.machines[branch.index];
      const phase = branch.index * 1.7 + branch.assetIndex * 0.8;
      const wave = Math.sin(tick * 0.31 - ageHours * 1.3 + phase);
      const progression = seed.load > 1 ? 1 - Math.min(0.18, ageHours / 600) : 1;
      const voltage = seed.voltage + wave * (seed.load > 1 ? 3.5 : 0.9);
      const current = electricalSeeds.nominalCurrent[branch.name] * seed.load * progression
        * (1 + 0.035 * wave + branch.assetIndex * 0.018);
      const pf = Math.min(0.99, Math.max(0.5, seed.pf - branch.assetIndex * 0.009 + wave * 0.006));
      const apparent = Math.sqrt(3) * voltage * current / 1000;
      const power = apparent * pf;
      const reactive = Math.sqrt(Math.max(0, apparent ** 2 - power ** 2));
      return { ...branch, voltage, current, power, reactive, apparent, pf,
        frequency: seed.frequency + Math.sin(tick * 0.13 - ageHours + phase) * 0.015 };
    });
  }
  function aggregate(rows: ElectricalReading[]): ElectricalReading {
    const sum = (key: ElectricalMetric) => rows.reduce((total, row) => total + row[key], 0);
    const power = sum('power'), reactive = sum('reactive');
    const apparent = Math.hypot(power, reactive);
    return { voltage: sum('voltage') / (rows.length || 1), current: sum('current') / (rows.length || 1),
      frequency: sum('frequency') / (rows.length || 1), power, reactive, apparent,
      pf: apparent ? power / apparent : 0 };
  }
  const rows = readings(0);
  const totals = aggregate(rows);
  const history = Array.from({ length: 48 }, (_, index) => aggregate(readings((47 - index) / 47 * hours)));
  return { rows, totals, history };
}

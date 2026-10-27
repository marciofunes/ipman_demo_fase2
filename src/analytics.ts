import { queryElectrical } from './electrical';
import { machineProfiles, mockData } from './data';
export type AnalyticsFilters = { machine: string; asset: string; period: string };
export const DEFAULT_FILTERS: AnalyticsFilters = {
  machine: '',
  asset: '',
  period: 'Últimas 8 horas',
};
export const periodHours = (period: string) =>
  period === 'Últimos 7 dias' ? 168 : period === 'Últimas 24 horas' ? 24 : 8;
const classify = (rms: number) => (rms >= 7.1 ? 'Crítico' : rms >= 3.5 ? 'Atenção' : 'Normal');
const heat = (rms: number) => (rms >= 7.1 ? 'hot' : rms >= 3.5 ? 'warm' : 'cool');

/** Query boundary for all five dashboards. Period changes historical aggregates;
 * RMS remains a measured quantity, never multiplied simply by the window length. */
export function queryAnalytics(filters: AnalyticsFilters, tick: number) {
  const hours = periodHours(filters.period);
  const machines = machineProfiles.filter((p) => !filters.machine || p.name === filters.machine);
  const sensors = machines.flatMap((p, machineIndex) =>
    Object.entries(p.sensors)
      .filter(([name]) => !filters.asset || name === filters.asset)
      .map(([name, values], sensorIndex) => {
        const [base, availability, gaps, frozen, clipping, sync] = values;
        const phase = machineProfiles.indexOf(p) * 1.7 + sensorIndex;
        const amplitude = base > 7 ? 0.65 : base > 3 ? 0.25 : 0.09;
        const rms = base + Math.sin(tick * 0.31 + phase) * amplitude;
        const quality = {
          gaps: Math.round((gaps * hours) / 8),
          frozen: Math.round((frozen * hours) / 8),
          clipping: Math.round((clipping * hours) / 8),
          sync: Math.round((sync * hours) / 8),
        };
        return {
          name,
          machine: p.name,
          rms,
          base,
          phase,
          amplitude,
          availability: Math.max(
            0,
            Math.min(
              100,
              availability -
                (hours / 8 - 1) * (100 - availability) * 0.025 +
                Math.sin(tick * 0.2 + phase) * 0.02,
            ),
          ),
          quality,
          issue: p.issue,
          status: classify(rms),
        };
      }),
  );
  const names = [...new Set(sensors.map((s) => s.name))];
  const assets = names.map((name) => {
    const rows = sensors.filter((s) => s.name === name);
    const worst = rows.reduce((a, b) => (a.rms > b.rms ? a : b));
    return {
      ...worst,
      availability: rows.reduce((s, r) => s + r.availability, 0) / rows.length,
      quality: {
        gaps: rows.reduce((s, r) => s + r.quality.gaps, 0),
        frozen: rows.reduce((s, r) => s + r.quality.frozen, 0),
        clipping: rows.reduce((s, r) => s + r.quality.clipping, 0),
        sync: rows.reduce((s, r) => s + r.quality.sync, 0),
      },
    };
  });
  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / (values.length || 1);
  const avg = mean(sensors.map((s) => s.rms));
  const max = Math.max(0, ...sensors.map((s) => s.rms));
  const quality = {
    windows: mean(sensors.map((s) => s.availability)),
    gaps: sensors.reduce((s, r) => s + r.quality.gaps, 0),
    frozen: sensors.reduce((s, r) => s + r.quality.frozen, 0),
    clipping: sensors.reduce((s, r) => s + r.quality.clipping, 0),
    sync: sensors.reduce((s, r) => s + r.quality.sync, 0),
  };
  const faults = sensors.filter((s) => s.status !== 'Normal' || s.availability < 98);
  const status = max >= 7.1 ? 'Crítico' : faults.length ? 'Atenção' : 'Normal';
  const series = Array.from({ length: 48 }, (_, i) =>
    mean(
      sensors.map((s) => {
        const age = ((47 - i) / 47) * hours;
        const progression = s.base >= 3.5 ? 1 - Math.min(0.45, age / 200) : 1;
        return Math.max(
          0.1,
          s.base * progression +
            Math.sin(tick * 0.31 - age * 0.9 + s.phase) * s.amplitude +
            Math.sin(age * 1.9 + s.phase) * s.amplitude * 0.7,
        );
      }),
    ),
  );
  const queue = faults
    .slice()
    .sort((a, b) => b.rms - a.rms)
    .map((s) => ({ asset: s.name, reason: s.issue, machine: s.machine }));
  return {
    ...mockData,
    hours,
    status,
    machines,
    sensorCount: sensors.length,
    plant: {
      ...mockData.plant,
      assets,
      series,
      quality,
      queue,
      electrical: queryElectrical(filters, tick),
    },
    analytics: {
      ...mockData.analytics,
      investigations: faults.length,
      baseline: {
        condition: 'Clean',
        outliers: sensors.filter((s) => s.rms >= 3.5).length,
        trend: max >= 3.5 ? 'Crescente' : 'Estável',
        version: filters.machine
          ? `v${machineProfiles.findIndex((p) => p.name === filters.machine) + 1}.2`
          : 'v1.2',
        coverage: Number((100 - (100 - quality.windows) * 0.7).toFixed(1)),
      },
      distribution: Array.from({ length: 18 }, (_, i) => ({
        baseline: Math.exp(-(((i - 2.3) / 1.3) ** 2)),
        current: Math.exp(-(((i - mean(series)) / Math.max(1, avg * 0.13)) ** 2)),
      })),
      featureCondition: assets.map((a) =>
        Array.from({ length: 6 }, (_, i) => heat(a.rms * (0.8 + i * 0.08))),
      ),
      temporalCondition: assets.map((a) =>
        Array.from({ length: 18 }, (_, i) =>
          heat(a.rms * (1 - ((17 - i) / 17) * Math.min(0.45, hours / 200))),
        ),
      ),
      investigation: {
        duration: faults.length ? Math.min(hours, 12 + max / 2) + tick / 3600 : 0,
        severity: status,
        origin: faults.length ? 'Alerta IPMAN' : 'Monitoramento contínuo',
        quality: quality.windows >= 98 ? 'Adequada' : 'Qualidade baixa',
        status: faults.length ? 'Em análise' : 'Sem ocorrências',
      },
      events: queue.length
        ? queue.slice(0, 5).map((q, i) => [q.asset, q.reason, `${Math.min(hours, i + 1)} h`])
        : [['Monitoramento contínuo', 'Operação estável', '—']],
    },
  };
}

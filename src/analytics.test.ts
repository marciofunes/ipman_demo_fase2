import { describe, it, expect } from 'vitest';
import { queryAnalytics, DEFAULT_FILTERS } from './analytics';
import { machineProfiles, assetOptions } from './data';

describe('global analytical query', () => {
  it('has two healthy CNCs, differentiated faults and a critical machine', () => {
    const profiles = machineProfiles.map((m) =>
      queryAnalytics({ ...DEFAULT_FILTERS, machine: m.name }, 0),
    );
    expect(profiles.slice(0, 2).map((p) => p.status)).toEqual(['Normal', 'Normal']);
    expect(profiles[3].status).toBe('Crítico');
    expect(profiles[3].plant.quality.clipping).toBeGreaterThan(0);
    expect(profiles[4].plant.quality.frozen).toBeGreaterThan(0);
    expect(new Set(profiles.map((p) => p.plant.series.join())).size).toBe(6);
    expect(profiles[0].analytics.investigations).toBe(0);
  });
  it('queries asset and period across every domain, without scaling RMS by duration', () => {
    const base = { ...DEFAULT_FILTERS, machine: 'GROB G300 • 04' };
    const spindle = queryAnalytics({ ...base, asset: 'Spindle' }, 0);
    const pump = queryAnalytics({ ...base, asset: 'Bomba 2' }, 0);
    const week = queryAnalytics({ ...base, asset: 'Bomba 2', period: 'Últimos 7 dias' }, 0);
    expect(pump.plant.assets).toHaveLength(1);
    expect(spindle.plant.quality).not.toEqual(pump.plant.quality);
    expect(spindle.plant.series).not.toEqual(pump.plant.series);
    expect(spindle.analytics.distribution).not.toEqual(pump.analytics.distribution);
    expect(spindle.analytics.featureCondition).not.toEqual(
      queryAnalytics({ ...DEFAULT_FILTERS, machine: 'GROB G300 • 01', asset: 'Spindle' }, 0)
        .analytics.featureCondition,
    );
    expect(week.plant.quality.gaps).toBe(pump.plant.quality.gaps * 21);
    expect(week.plant.series).not.toEqual(pump.plant.series);
    expect(week.analytics.temporalCondition).not.toEqual(pump.analytics.temporalCondition);
    expect(week.analytics.investigation.duration).not.toEqual(
      pump.analytics.investigation.duration,
    );
    expect(week.plant.assets[0].rms).toBe(pump.plant.assets[0].rms);
    expect(assetOptions('Rebarbadora • 01')).toEqual(['Motor rebarba', 'Bomba rebarba']);
  });
  it('updates curves and sensor readings every tick, preserving inspection evidence', () => {
    const a = queryAnalytics(DEFAULT_FILTERS, 0),
      b = queryAnalytics(DEFAULT_FILTERS, 1);
    expect(a.plant.series).not.toEqual(b.plant.series);
    expect(a.plant.assets[0].rms).not.toBe(b.plant.assets[0].rms);
    expect(a.inspection).toBe(b.inspection);
  });
});

import { describe, it, expect } from 'vitest';
import { queryElectrical } from './electrical';
import { DEFAULT_FILTERS } from './analytics';
import { mockData } from './data';

describe('electrical measurements', () => {
  it('preserves three-phase power identities and aggregation across branches', () => {
    const result = queryElectrical(DEFAULT_FILTERS, 10);
    for (const row of result.rows) {
      expect(row.apparent).toBeCloseTo(Math.sqrt(3) * row.voltage * row.current / 1000, 10);
      expect(row.power).toBeCloseTo(row.apparent * row.pf, 10);
      expect(row.apparent ** 2).toBeCloseTo(row.power ** 2 + row.reactive ** 2, 10);
      expect(row.pf).toBeGreaterThan(0);
      expect(row.pf).toBeLessThanOrEqual(1);
    }
    expect(result.totals.power).toBeCloseTo(result.rows.reduce((n, r) => n + r.power, 0), 10);
    expect(result.totals.apparent ** 2).toBeCloseTo(result.totals.power ** 2 + result.totals.reactive ** 2, 8);
    expect(result.history.at(-1)).toEqual(result.totals);
  });
  it('responds to machine, asset, history window and every clock tick', () => {
    const filters = { ...DEFAULT_FILTERS, machine: 'GROB G300 • 04' };
    const full = queryElectrical(filters, 0);
    const asset = queryElectrical({ ...filters, asset: 'Bomba 2' }, 0);
    expect(asset.rows).toHaveLength(1);
    expect(asset.rows[0]).toEqual(full.rows.find(r => r.name === 'Bomba 2'));
    const healthy = queryElectrical({ ...filters, machine: 'GROB G300 • 01' }, 0);
    expect(full.totals.current).toBeGreaterThan(healthy.totals.current);
    expect(full.totals.pf).toBeLessThan(healthy.totals.pf);
    const week = queryElectrical({ ...filters, period: 'Últimos 7 dias' }, 0);
    expect(week.totals).toEqual(full.totals);
    expect(week.history).not.toEqual(full.history);
    const next = queryElectrical(filters, 1);
    for (const key of ['voltage', 'current', 'power', 'pf', 'frequency'] as const) {
      expect(next.totals[key]).not.toEqual(full.totals[key]);
    }
    expect(queryElectrical({ ...filters, asset: 'missing' }, 0).totals.power).toBe(0);
  });
});

it('provides an eight-hour production window with unique pieces and independent evidence', () => {
  const rows = mockData.inspection.history;
  const time = (i: typeof rows[number]) => Date.parse(`${i.date}T${i.time}Z`);
  expect(rows).toHaveLength(480);
  expect(new Set(rows.map(i => i.id)).size).toBe(rows.length);
  const duration = (time(rows[0]) - time(rows.at(-1)!)) / 3600000;
  expect(duration).toBeGreaterThan(7.9);
  expect(duration).toBeLessThan(8);
  expect(rows.slice(1).every((row, i) => time(row) < time(rows[i]))).toBe(true);
  expect(rows[5].fields).not.toBe(rows[42].fields);
});

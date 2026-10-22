import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { mockData } from './data';

// One clock and one immutable snapshot for all operational views. Inspection
// evidence/references intentionally retain their original, versioned snapshots.
export function telemetrySnapshot(tick: number) {
  const assets = mockData.plant.assets.map((asset, i) => {
    const wave = Math.sin(tick * 0.39 + i * 1.8);
    const rms = Math.max(0.3, asset.rms + wave * 0.42 + Math.sin(tick * 0.13 + i) * 0.16);
    return {
      ...asset,
      rms,
      availability: Math.min(100, asset.availability + wave * 0.24),
      status: rms >= 3.5 ? 'Atenção' : 'Normal',
    };
  });
  return {
    ...mockData,
    plant: {
      ...mockData.plant,
      assets,
      series: Array.from(
        { length: 48 },
        (_, i) =>
          2.7 + Math.sin((tick - 47 + i) * 0.29) * 0.48 + Math.sin((tick - 47 + i) * 0.071) * 0.25,
      ),
      metrics: {
        current: 12.4 + Math.sin(tick * 0.31) * 0.65,
        power: 7.8 + Math.sin(tick * 0.31) * 0.36,
        pf: 0.92 + Math.sin(tick * 0.13) * 0.01,
      },
      quality: { ...mockData.plant.quality, windows: 98.6 + Math.sin(tick * 0.17) * 0.55 },
    },
    analytics: {
      ...mockData.analytics,
      baseline: {
        ...mockData.analytics.baseline,
        outliers: assets.filter((a) => a.rms >= 3).length,
        coverage: 96 + Math.sin(tick * 0.15) * 0.7,
      },
      investigation: {
        ...mockData.analytics.investigation,
        duration: mockData.analytics.investigation.duration + tick / 3600,
      },
      distribution: mockData.analytics.distribution.map((v, i) => ({
        ...v,
        current: Math.exp(-(((i - 9 - Math.sin(tick * 0.2)) / 4) ** 2)),
      })),
      featureCondition: assets.map((a, i) =>
        Array.from({ length: 6 }, (_, j) =>
          a.rms + Math.sin(tick * 0.2 + j + i) * 0.6 > 4 ? 'hot' : a.rms > 2.5 ? 'warm' : 'cool',
        ),
      ),
      temporalCondition: assets.map((a, i) =>
        Array.from({ length: 18 }, (_, j) =>
          a.rms + Math.sin((tick - 17 + j) * 0.25 + i) * 0.5 > 4
            ? 'hot'
            : a.rms > 2.5
              ? 'warm'
              : 'cool',
        ),
      ),
    },
  };
}
const initial = { tick: 0, now: new Date(), data: telemetrySnapshot(0) };
const LiveContext = createContext(initial);
export function LiveProvider({ children }: { children: ReactNode }) {
  const [clock, setClock] = useState(() => ({ tick: 0, now: new Date() }));
  useEffect(() => {
    const timer = window.setInterval(
      () => setClock((previous) => ({ tick: previous.tick + 1, now: new Date() })),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const value = useMemo(() => ({ ...clock, data: telemetrySnapshot(clock.tick) }), [clock]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
export const useLive = () => useContext(LiveContext);
export const formatClock = (date: Date, locale: string) =>
  date.toLocaleTimeString(locale, {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

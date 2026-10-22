import { act, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveProvider, useLive, formatClock, telemetrySnapshot } from './live';
import { mockData } from './data';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('shared one-second operational clock', () => {
  it('advances once per second and cleans up its timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T15:00:00Z'));
    function Probe() {
      const { tick, now, data } = useLive();
      return (
        <output>
          {tick}|{formatClock(now, 'pt-BR')}|{data.plant.assets[0].rms.toFixed(3)}
        </output>
      );
    }
    const view = render(
      <LiveProvider>
        <Probe />
      </LiveProvider>,
    );
    const first = screen.getByRole('status').textContent;
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('status')).toHaveTextContent('1|12:00:01');
    expect(screen.getByRole('status').textContent).not.toBe(first);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('status')).toHaveTextContent('2|12:00:02');
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('evolves cards, time series, quality and heatmaps without changing inspection evidence', () => {
    const a = telemetrySnapshot(0),
      b = telemetrySnapshot(8);
    expect(a.plant.series).not.toEqual(b.plant.series);
    expect(a.plant.assets[0].rms).not.toBe(b.plant.assets[0].rms);
    expect(a.plant.quality.windows).not.toBe(b.plant.quality.windows);
    expect(a.analytics.distribution).not.toEqual(b.analytics.distribution);
    expect(b.inspection).toBe(mockData.inspection);
    expect(b.references).toBe(mockData.references);
    expect(mockData.plant.assets[0].rms).toBe(2.1);
  });
});

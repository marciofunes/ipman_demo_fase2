import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DigitalTwin from './screens/DigitalTwin';
import { I18nProvider } from '../i18n';
import { LiveProvider } from '../live';
import { useTwin } from './twin/store';
import { defaultParams } from './twin/whatif';
import { layoutLabels } from './three/labels';
vi.mock('./three/G300Scene', () => ({ default: () => <div data-testid="scene-stub" /> }));
const mount = () =>
  render(
    <I18nProvider>
      <LiveProvider>
        <DigitalTwin />
      </LiveProvider>
    </I18nProvider>,
  );
beforeEach(() => {
  useTwin.setState({ params: defaultParams(), selected: 'spindle', xray: false, labels: true });
  useTwin.getState().sample(1000);
});
describe('supplied Twin integration', () => {
  it('responds immediately to component parameters and fault presets', async () => {
    mount();
    await screen.findByTestId('scene-stub');
    expect(screen.getByTestId('twin-condition')).toHaveTextContent('Normal');
    fireEvent.change(screen.getByTestId('param-bearingWear'), { target: { value: '95' } });
    expect(screen.getByTestId('twin-condition')).toHaveTextContent('Crítico');
    const u = userEvent.setup();
    await u.click(screen.getByTestId('comp-bomba1'));
    await u.click(screen.getByTestId('preset-cavitation'));
    expect(useTwin.getState().params.bomba1.tankLevel).toBe(8);
    expect(screen.getByTestId('twin-condition')).toHaveTextContent('Crítico');
    await u.click(screen.getByTestId('xray'));
    expect(useTwin.getState().xray).toBe(true);
    expect(screen.getByTestId('xray')).toHaveAttribute('aria-pressed', 'true');
  });
  it('retains a bounded sixty-second history and replaces a sample within the same second', () => {
    act(() => {
      for (let t = 1000; t < 1100; t++) useTwin.getState().sample(t);
    });
    expect(useTwin.getState().history.spindle).toHaveLength(60);
    const old = useTwin.getState().history.spindle;
    act(() => useTwin.getState().sample(1099));
    expect(useTwin.getState().history.spindle).toHaveLength(60);
    expect(useTwin.getState().history.spindle[0].t).toBe(old[0].t);
  });
  it('keeps neighboring labels separated and inside the viewport', () => {
    const boxes = [0, 1, 2, 3].map((i) => ({
      id: `l${i}`,
      ax: 700,
      ay: 300 + i * 5,
      w: 150,
      h: 50,
    }));
    const placed = layoutLabels(boxes, 1000, 600);
    for (let i = 1; i < placed.length; i++)
      expect(placed[i].y).toBeGreaterThanOrEqual(placed[i - 1].y + placed[i - 1].h);
    placed.forEach((p) => expect(p.y + p.h).toBeLessThanOrEqual(600));
  });
});

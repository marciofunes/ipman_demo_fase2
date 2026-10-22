import { act, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { layoutLabels } from '../three/labels';
import { useTwin } from '../twin/store';
import { defaultParams } from '../twin/whatif';
import { renderApp, T0 } from './utils';

vi.mock('../three/G300Scene', () => ({ default: () => <div data-testid="scene-stub" /> }));

describe('Digital Twin', () => {
  it('mostra os cards de vibração e elétrica do componente selecionado e reage aos parâmetros', async () => {
    useTwin.setState({ params: defaultParams(), selected: 'spindle' });
    await renderApp('/digital-twin');
    await screen.findByTestId('scene-stub');
    expect(screen.getByTestId('twin-condition')).toHaveTextContent('Normal');
    fireEvent.change(screen.getByTestId('param-bearingWear'), { target: { value: '95' } });
    act(() => useTwin.getState().sample(T0 + 1));
    expect(screen.getByTestId('twin-condition')).toHaveTextContent('Crítico');
  });

  it('troca de componente e aplica cenário pronto', async () => {
    const user = userEvent.setup();
    useTwin.setState({ params: defaultParams(), selected: 'spindle' });
    await renderApp('/digital-twin');
    await user.click(await screen.findByTestId('comp-bomba1'));
    expect(screen.getByTestId('param-tankLevel')).toBeInTheDocument();
    await user.click(screen.getByTestId('preset-cavitation'));
    expect(useTwin.getState().params.bomba1.tankLevel).toBe(8);
    expect(screen.getByTestId('twin-condition')).toHaveTextContent('Crítico');
  });

  it('botão Raio-X alterna o estado', async () => {
    const user = userEvent.setup();
    useTwin.setState({ xray: false });
    await renderApp('/digital-twin');
    await user.click(await screen.findByTestId('xray'));
    expect(useTwin.getState().xray).toBe(true);
    expect(screen.getByTestId('xray')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('layout dos rótulos 3D', () => {
  it('não sobrepõe rótulos do mesmo lado', () => {
    const boxes = [0, 1, 2, 3].map((i) => ({ id: `l${i}`, ax: 700, ay: 300 + i * 5, w: 150, h: 50 }));
    const placed = layoutLabels(boxes, 1000, 600);
    for (let i = 1; i < placed.length; i += 1) expect(placed[i].y).toBeGreaterThanOrEqual(placed[i - 1].y + placed[i - 1].h);
    placed.forEach((p) => expect(p.y + p.h).toBeLessThanOrEqual(600));
  });
});

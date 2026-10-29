import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CurrentInspection } from './Inspection';
import { demoRepository, mockData } from './data';
import { I18nProvider } from './i18n';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const mount = (setInspection = vi.fn()) => {
  const view = render(
    <I18nProvider>
      <CurrentInspection
        inspection={mockData.inspection.inspections[0]}
        setInspection={setInspection}
        activeVersion={4}
      />
    </I18nProvider>,
  );
  return { ...view, setInspection };
};

describe('automatic inspection', () => {
  it('starts every five seconds and loops through all existing cases', async () => {
    vi.useFakeTimers();
    const { setInspection, unmount } = mount();
    const inspect = vi.spyOn(demoRepository, 'inspect');
    expect(
      screen.queryByRole('button', { name: 'Executar nova inspeção' }),
    ).not.toBeInTheDocument();
    await advance(4999);
    expect(inspect).not.toHaveBeenCalled();
    await advance(1);
    expect(screen.getByRole('status')).toHaveTextContent('Processando inspeção');
    await advance(650);
    expect(setInspection).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: mockData.inspection.inspections[1].id, version: 4 }),
    );
    await advance(20000);
    expect(inspect).toHaveBeenCalledTimes(5);
    expect(setInspection).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: mockData.inspection.inspections[0].id }),
    );
    unmount();
    await advance(10000);
    expect(inspect).toHaveBeenCalledTimes(5);
  });

  it('shows an error and retries automatically on the next tick', async () => {
    vi.useFakeTimers();
    vi.spyOn(demoRepository, 'inspect').mockRejectedValueOnce(new Error('unavailable'));
    const { setInspection } = mount();
    await advance(5000);
    expect(screen.getByRole('alert')).toHaveTextContent('Nova tentativa automática');
    await advance(5650);
    expect(setInspection).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('prevents concurrent requests and ignores results after leaving the screen', async () => {
    vi.useFakeTimers();
    let resolve!: (value: (typeof mockData.inspection.inspections)[0]) => void;
    const inspect = vi.spyOn(demoRepository, 'inspect').mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { setInspection, unmount } = mount();
    await advance(15000);
    expect(inspect).toHaveBeenCalledOnce();
    unmount();
    await act(async () => resolve(mockData.inspection.inspections[1]));
    expect(setInspection).not.toHaveBeenCalled();
  });
});

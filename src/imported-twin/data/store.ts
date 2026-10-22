import { useLive } from '../../live';
/** Reuses the application's single one-second clock. */
export function useApp<T>(selector: (state: { nowS: number }) => T) {
  const { now } = useLive();
  return selector({ nowS: Math.floor(now.getTime() / 1000) });
}

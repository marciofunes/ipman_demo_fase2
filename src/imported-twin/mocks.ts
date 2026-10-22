/** Bounded measurement noise, reproducible and independent by sensor. */
export function twinNoise(component: string, metric: string, seconds: number) {
  const seed = [...(component + metric)].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return (
    (Math.sin(seconds * 0.37 + seed) + Math.sin(seconds * 0.13 + seed * 0.7)) *
    (metric === 'pf' ? 0.002 : 0.008)
  );
}

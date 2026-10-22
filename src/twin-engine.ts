// The numerical model is intentionally local and illustrative. No values are
// claimed to be live machine measurements. UI presentation is configured separately.
export type ComponentId = 'spindle' | 'motor' | 'pump1' | 'pump2' | 'pump3' | 'table';
export type ComponentParameters = {
  rpm: number;
  load: number;
  imbalance: number;
  restriction: number;
};
export type TwinScenario = Record<ComponentId, ComponentParameters>;
export const componentDefinitions = [
  {
    id: 'spindle',
    name: 'Spindle',
    rpm: 6000,
    range: [1500, 12000],
    rms: 2.1,
    current: 12.4,
    power: 7.8,
    pf: 0.92,
  },
  {
    id: 'motor',
    name: 'Motor principal',
    rpm: 3000,
    range: [600, 6000],
    rms: 1.6,
    current: 8.2,
    power: 4.4,
    pf: 0.91,
  },
  {
    id: 'pump1',
    name: 'Bomba 1',
    rpm: 2850,
    range: [600, 3600],
    rms: 1.8,
    current: 3.2,
    power: 1.5,
    pf: 0.89,
  },
  {
    id: 'pump2',
    name: 'Bomba 2',
    rpm: 2850,
    range: [600, 3600],
    rms: 2.2,
    current: 4.1,
    power: 2.2,
    pf: 0.9,
  },
  {
    id: 'pump3',
    name: 'Bomba 3',
    rpm: 2850,
    range: [600, 3600],
    rms: 1.4,
    current: 2.8,
    power: 1.1,
    pf: 0.88,
  },
  {
    id: 'table',
    name: 'Mesa giratória',
    rpm: 6,
    range: [1, 15],
    rms: 0.8,
    current: 2.6,
    power: 1.2,
    pf: 0.92,
  },
] as const;
export const componentIds = componentDefinitions.map((c) => c.id);
export function defaultTwinScenario(): TwinScenario {
  return Object.fromEntries(
    componentDefinitions.map((c) => [c.id, { rpm: c.rpm, load: 60, imbalance: 0, restriction: 0 }]),
  ) as TwinScenario;
}
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
export const conditionColor = (rms: number) =>
  rms >= 5 ? '#eb5147' : rms >= 3 ? '#eea321' : '#25ad91';
export const conditionName = (rms: number) =>
  rms >= 5 ? 'Crítico' : rms >= 3 ? 'Atenção' : 'Normal';
export function evaluateTwin(scenario: TwinScenario, tick: number) {
  const parameters = Object.fromEntries(
    componentDefinitions.map((c) => {
      const p = scenario[c.id];
      return [
        c.id,
        {
          rpm: clamp(p.rpm, c.range[0], c.range[1]),
          load: clamp(p.load, 20, 100),
          imbalance: clamp(p.imbalance, 0, 100),
          restriction: clamp(p.restriction, 0, 90),
        },
      ];
    }),
  ) as TwinScenario;
  const readings = Object.fromEntries(
    componentDefinitions.map((c, i) => {
      const p = parameters[c.id],
        speed = p.rpm / c.rpm,
        load = p.load / 60;
      const ripple =
        1 + Math.sin(tick * 0.47 + i * 1.3) * 0.035 + Math.sin(tick * 0.17 + i) * 0.012;
      const rms =
        (c.rms * (0.55 + 0.45 * speed ** 2) * (0.65 + 0.35 * load) +
          p.imbalance * 0.085 * Math.max(0.4, speed) +
          p.restriction * 0.055) *
        ripple;
      const current =
        c.current *
        (0.28 + 0.72 * load) *
        (0.82 + 0.18 * speed) *
        (1 + p.restriction * 0.005 + p.imbalance * 0.0015) *
        ripple;
      const pf = clamp(
        c.pf -
          Math.abs(load - 1) * 0.04 -
          p.imbalance * 0.0006 -
          p.restriction * 0.0008 +
          Math.sin(tick * 0.19 + i) * 0.004,
        0.6,
        0.99,
      );
      return [
        c.id,
        {
          ...p,
          rms,
          current,
          power: c.power * (current / c.current) * (0.8 + 0.2 * speed),
          pf,
          score: 0,
          condition: 'Normal',
        },
      ];
    }),
  ) as Record<
    ComponentId,
    {
      rpm: number;
      load: number;
      imbalance: number;
      restriction: number;
      rms: number;
      current: number;
      power: number;
      pf: number;
      score: number;
      condition: string;
    }
  >;
  // Mechanical coupling makes a fault in one unit visible in connected units.
  readings.spindle.rms +=
    Math.max(0, readings.motor.rms - 2) * 0.3 + Math.max(0, readings.pump1.rms - 2.5) * 0.16;
  readings.motor.rms += Math.max(0, readings.spindle.rms - 3) * 0.17;
  readings.table.rms +=
    Math.max(0, readings.spindle.rms - 3) * 0.12 + Math.max(0, readings.pump2.rms - 3) * 0.08;
  componentIds.forEach((id) => {
    readings[id].score = clamp(
      (readings[id].rms - 2) * 17 + readings[id].restriction * 0.15,
      0,
      100,
    );
    readings[id].condition = conditionName(readings[id].rms);
  });
  return readings;
}
export type TwinReadings = ReturnType<typeof evaluateTwin>;

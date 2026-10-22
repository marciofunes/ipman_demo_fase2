/**
 * Modelo what-if do Digital Twin (G300).
 *
 * Funções puras e explicáveis que transformam parâmetros de processo de cada componente
 * nas MESMAS variáveis monitoradas do slide (Frente Sensoriamento):
 *   vibração: RMS, curtose (kurtosis), fator de crista (crest)
 *   elétrica trifásica: tensão, corrente, P, Q, S, FP
 *
 * Limiares de condição (ISO 10816-3, grupo 2, base rígida):
 *   RMS  < 2,8 mm/s normal | 2,8–4,5 atenção | ≥ 4,5 crítico
 *   Curtose < 4 normal     | 4–6 atenção     | ≥ 6 crítico (impulsividade de rolamento)
 *   Carga elétrica > 100 % atenção | > 115 % crítico
 */

export type ComponentId = 'spindle' | 'table' | 'bomba1' | 'bomba2' | 'bomba3';
export type TwinStatus = 'normal' | 'attention' | 'critical';

export interface ParamDef {
  key: string;
  /** chave i18n do rótulo */
  labelKey: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface ComponentDef {
  id: ComponentId;
  labelKey: string;
  /** potência nominal do motor (kW) */
  ratedKW: number;
  params: ParamDef[];
}

export const VOLTAGE = 380; // V entre fases

export const THRESHOLDS = {
  rms: { attention: 2.8, critical: 4.5 },
  kurtosis: { attention: 4, critical: 6 },
  load: { attention: 1.0, critical: 1.15 },
};

const pumpParams = (p: {
  pressure: [number, number, number];
  bearing: number;
  misalign: number;
  tank?: boolean;
}): ParamDef[] => [
  {
    key: 'frequency',
    labelKey: 'params.frequency',
    unit: 'Hz',
    min: 30,
    max: 60,
    step: 1,
    default: 50,
  },
  {
    key: 'pressure',
    labelKey: 'params.pressure',
    unit: 'bar',
    min: p.pressure[0],
    max: p.pressure[1],
    step: p.pressure[1] > 20 ? 1 : 0.1,
    default: p.pressure[2],
  },
  {
    key: 'misalignment',
    labelKey: 'params.misalignment',
    unit: 'mm',
    min: 0,
    max: 0.8,
    step: 0.01,
    default: p.misalign,
  },
  {
    key: 'bearingWear',
    labelKey: 'params.bearingWear',
    unit: '%',
    min: 0,
    max: 100,
    step: 1,
    default: p.bearing,
  },
  ...(p.tank
    ? [
        {
          key: 'tankLevel',
          labelKey: 'params.tankLevel',
          unit: '%',
          min: 5,
          max: 100,
          step: 1,
          default: 85,
        },
      ]
    : []),
];

export const COMPONENTS: ComponentDef[] = [
  {
    id: 'spindle',
    labelKey: 'twin.components.spindle',
    ratedKW: 25,
    params: [
      {
        key: 'speed',
        labelKey: 'params.spindleSpeed',
        unit: 'rpm',
        min: 4000,
        max: 20000,
        step: 100,
        default: 10000,
      },
      {
        key: 'feed',
        labelKey: 'params.feed',
        unit: 'mm/min',
        min: 500,
        max: 6000,
        step: 50,
        default: 2400,
      },
      {
        key: 'depth',
        labelKey: 'params.depth',
        unit: 'mm',
        min: 0.2,
        max: 4,
        step: 0.1,
        default: 1.5,
      },
      {
        key: 'unbalance',
        labelKey: 'params.unbalance',
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        default: 6,
      },
      {
        key: 'bearingWear',
        labelKey: 'params.bearingWear',
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        default: 8,
      },
      {
        key: 'toolWear',
        labelKey: 'params.toolWear',
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        default: 15,
      },
    ],
  },
  {
    id: 'table',
    labelKey: 'twin.components.table',
    ratedKW: 4,
    params: [
      {
        key: 'speed',
        labelKey: 'params.tableSpeed',
        unit: 'rpm',
        min: 1,
        max: 25,
        step: 0.5,
        default: 8,
      },
      { key: 'load', labelKey: 'params.load', unit: 'kg', min: 5, max: 200, step: 1, default: 40 },
      {
        key: 'eccentricity',
        labelKey: 'params.eccentricity',
        unit: 'mm',
        min: 0,
        max: 20,
        step: 0.5,
        default: 2,
      },
      {
        key: 'bearingWear',
        labelKey: 'params.bearingWear',
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        default: 5,
      },
    ],
  },
  {
    id: 'bomba1',
    labelKey: 'twin.components.bomba1',
    ratedKW: 3,
    params: pumpParams({ pressure: [1, 8, 4], bearing: 10, misalign: 0.05, tank: true }),
  },
  {
    id: 'bomba2',
    labelKey: 'twin.components.bomba2',
    ratedKW: 11,
    params: pumpParams({ pressure: [40, 160, 90], bearing: 45, misalign: 0.08, tank: true }),
  },
  {
    id: 'bomba3',
    labelKey: 'twin.components.bomba3',
    ratedKW: 7.5,
    params: pumpParams({ pressure: [20, 80, 60], bearing: 12, misalign: 0.06 }),
  },
];

export type Params = Record<string, number>;
export type TwinParams = Record<ComponentId, Params>;

export function defaultParams(): TwinParams {
  const out = {} as TwinParams;
  for (const c of COMPONENTS)
    out[c.id] = Object.fromEntries(c.params.map((p) => [p.key, p.default]));
  return out;
}

export interface Contribution {
  /** chave i18n do mecanismo */
  key: string;
  /** contribuição para o RMS (mm/s) */
  value: number;
}

export interface Readings {
  rms: number;
  kurtosis: number;
  crest: number;
  voltage: number;
  current: number;
  /** potência ativa P (kW) */
  power: number;
  /** potência reativa Q (kvar) */
  reactive: number;
  /** potência aparente S (kVA) */
  apparent: number;
  pf: number;
  /** fração da potência nominal */
  load: number;
  /** rotação do eixo para animação (rpm) */
  shaftRpm: number;
  status: TwinStatus;
  /** 0..1, intensidade visual do problema */
  severity: number;
  contributions: Contribution[];
  /** sinal de chatter (instabilidade de corte) – apenas spindle */
  chatter?: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** fator de potência de motor de indução em função da carga */
export function powerFactor(load: number): number {
  return clamp(0.42 + 0.62 * load - 0.22 * load * load, 0.35, 0.9);
}

export function electrical(powerKW: number, ratedKW: number) {
  const load = powerKW / ratedKW;
  const pf = powerFactor(load);
  const apparent = powerKW / pf;
  const reactive = Math.sqrt(Math.max(0, apparent * apparent - powerKW * powerKW));
  const current = (apparent * 1000) / (Math.sqrt(3) * VOLTAGE);
  return { load, pf, apparent, reactive, current };
}

function level(v: number, t: { attention: number; critical: number }): TwinStatus {
  if (v >= t.critical) return 'critical';
  if (v >= t.attention) return 'attention';
  return 'normal';
}

const RANK: Record<TwinStatus, number> = { normal: 0, attention: 1, critical: 2 };
export function worst(...s: TwinStatus[]): TwinStatus {
  return s.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'normal' as TwinStatus);
}

export function classify(
  rms: number,
  kurtosis: number,
  load: number,
): { status: TwinStatus; severity: number } {
  const status = worst(
    level(rms, THRESHOLDS.rms),
    level(kurtosis, THRESHOLDS.kurtosis),
    level(load, THRESHOLDS.load),
  );
  const severity = clamp(
    Math.max(
      (rms - 1.8) / (THRESHOLDS.rms.critical + 2 - 1.8),
      (kurtosis - 3.2) / (THRESHOLDS.kurtosis.critical + 2 - 3.2),
      (load - 0.8) / 0.5,
    ),
    0,
    1,
  );
  return { status, severity };
}

/** limite de estabilidade (lóbulos) – profundidade máxima sem chatter para a rotação */
export function stabilityLimit(speed: number): number {
  return 2.2 + 1.2 * Math.cos((2 * Math.PI * speed) / 5000);
}

export function spindleModel(p: Params): Readings {
  const n = p.speed;
  const u = p.unbalance / 100;
  const w = p.bearingWear / 100;
  const tw = p.toolWear / 100;
  const kc = 1400 * (1 + 0.6 * tw); // N/mm², pressão específica de corte cresce com desgaste
  const ae = 40; // mm, largura de corte
  const cutKW = (p.depth * ae * p.feed * kc) / 60e6;
  const idleKW = 1.2 + 4.5 * (n / 20000) ** 2;
  const powerKW = (cutKW + idleKW) / 0.9;
  const limit = stabilityLimit(n);
  const chatterExcess = Math.max(0, p.depth - limit);
  const contributions: Contribution[] = [
    { key: 'mech.base', value: 0.6 },
    { key: 'mech.unbalance', value: 4.2 * u * (n / 12000) ** 2 },
    { key: 'mech.bearing', value: 3.5 * w ** 1.6 },
    { key: 'mech.cutting', value: 0.12 * cutKW },
    { key: 'mech.chatter', value: 2.6 * chatterExcess },
    { key: 'mech.resonance', value: 1.1 * Math.exp(-(((n - 15000) / 900) ** 2)) },
  ];
  const rms = contributions.reduce((s, c) => s + c.value, 0);
  const kurtosis =
    3 + 5.5 * w ** 1.8 + (chatterExcess > 0 ? 1.0 + 0.6 * chatterExcess : 0) + 0.8 * tw;
  const crest = 3 + 2.2 * w ** 1.5 + 0.6 * tw + 0.4 * u + 0.5 * Math.min(1, chatterExcess);
  const e = electrical(powerKW, 25);
  const c = classify(rms, kurtosis, e.load);
  return {
    rms,
    kurtosis,
    crest,
    voltage: VOLTAGE,
    power: powerKW,
    ...e,
    shaftRpm: n,
    ...c,
    contributions,
    chatter: chatterExcess > 0,
  };
}

export function tableModel(p: Params): Readings {
  const m = p.load / 200;
  const ecc = p.eccentricity / 20;
  const w = p.bearingWear / 100;
  const sp = p.speed / 25;
  const contributions: Contribution[] = [
    { key: 'mech.base', value: 0.5 },
    { key: 'mech.eccentricity', value: 6 * m * ecc * (0.6 * sp * sp + 0.4) },
    { key: 'mech.bearing', value: 3 * w ** 1.6 },
    { key: 'mech.inertia', value: 0.6 * m * sp },
  ];
  const rms = contributions.reduce((s, c) => s + c.value, 0);
  const kurtosis = 3 + 4.5 * w ** 1.8 + 0.4 * ecc;
  const crest = 3 + 2 * w ** 1.5 + 0.3 * ecc;
  const powerKW = 0.35 + 2.6 * m * (0.3 + sp) + 1.2 * m * ecc;
  const e = electrical(powerKW, 4);
  const c = classify(rms, kurtosis, e.load);
  return {
    rms,
    kurtosis,
    crest,
    voltage: VOLTAGE,
    power: powerKW,
    ...e,
    shaftRpm: p.speed,
    ...c,
    contributions,
  };
}

const PUMP_NOMINAL: Record<
  'bomba1' | 'bomba2' | 'bomba3',
  { flowLpm: number; pressure: number; rated: number }
> = {
  bomba1: { flowLpm: 120, pressure: 4, rated: 3 },
  bomba2: { flowLpm: 40, pressure: 90, rated: 11 },
  bomba3: { flowLpm: 25, pressure: 60, rated: 7.5 },
};

/** risco de cavitação (0..1) a partir do nível do tanque */
export function cavitation(tankLevel: number | undefined): number {
  if (tankLevel === undefined) return 0;
  return clamp((35 - tankLevel) / 25, 0, 1);
}

export function pumpModel(id: 'bomba1' | 'bomba2' | 'bomba3', p: Params): Readings {
  const nom = PUMP_NOMINAL[id];
  const f = p.frequency / 50;
  const w = p.bearingWear / 100;
  const cav = cavitation(p.tankLevel);
  const flow = nom.flowLpm * f * (1 - 0.35 * cav);
  const hydraulicKW = (flow * p.pressure) / 600;
  const powerKW = hydraulicKW / 0.72 / 0.88 + 0.08 * nom.rated;
  const overPressure = Math.max(0, p.pressure / nom.pressure - 1);
  const contributions: Contribution[] = [
    { key: 'mech.base', value: 0.9 },
    { key: 'mech.misalignment', value: 7.5 * p.misalignment * f ** 1.2 },
    { key: 'mech.bearing', value: 3.8 * w ** 1.6 },
    { key: 'mech.cavitation', value: 3.2 * cav },
    { key: 'mech.hydraulic', value: 0.25 * f + 0.9 * overPressure },
  ];
  const rms = contributions.reduce((s, c) => s + c.value, 0);
  const kurtosis = 3 + 5 * w ** 1.8 + 3.2 * cav;
  const crest = 3 + 2 * w ** 1.5 + 1.6 * cav + 0.8 * p.misalignment;
  const e = electrical(powerKW, nom.rated);
  const c = classify(rms, kurtosis, e.load);
  return {
    rms,
    kurtosis,
    crest,
    voltage: VOLTAGE,
    power: powerKW,
    ...e,
    shaftRpm: 2910 * f,
    ...c,
    contributions,
  };
}

export function evaluate(id: ComponentId, p: Params): Readings {
  if (id === 'spindle') return spindleModel(p);
  if (id === 'table') return tableModel(p);
  return pumpModel(id, p);
}

export function evaluateAll(params: TwinParams): Record<ComponentId, Readings> {
  return Object.fromEntries(COMPONENTS.map((c) => [c.id, evaluate(c.id, params[c.id])])) as Record<
    ComponentId,
    Readings
  >;
}

/** Medidor trifásico da máquina: soma vetorial de P e Q dos componentes. */
export function machineElectrical(r: Record<ComponentId, Readings>) {
  const P = Object.values(r).reduce((s, x) => s + x.power, 0) + 2.2; // auxiliares e CNC
  const Q = Object.values(r).reduce((s, x) => s + x.reactive, 0) + 1.1;
  const S = Math.sqrt(P * P + Q * Q);
  const pf = P / S;
  const current = (S * 1000) / (Math.sqrt(3) * VOLTAGE);
  return { voltage: VOLTAGE, current, power: P, reactive: Q, apparent: S, pf };
}

/** Tempo de ciclo por face (s) para a animação de usinagem, função do avanço. */
export function cycleSeconds(spindle: Params): number {
  return clamp(7 * (2400 / spindle.feed), 3, 20);
}

export interface Preset {
  id: string;
  labelKey: string;
  component: ComponentId | 'all';
  apply: (p: TwinParams) => TwinParams;
}

const set = (p: TwinParams, id: ComponentId, v: Params): TwinParams => ({
  ...p,
  [id]: { ...p[id], ...v },
});

export const PRESETS: Preset[] = [
  { id: 'current', labelKey: 'presets.current', component: 'all', apply: () => defaultParams() },
  {
    id: 'healthy',
    labelKey: 'presets.healthy',
    component: 'all',
    apply: () => {
      let p = defaultParams();
      p = set(p, 'bomba2', { bearingWear: 8 });
      return p;
    },
  },
  {
    id: 'unbalance',
    labelKey: 'presets.unbalance',
    component: 'spindle',
    apply: (p) => set(p, 'spindle', { unbalance: 75, speed: 16000 }),
  },
  {
    id: 'chatter',
    labelKey: 'presets.chatter',
    component: 'spindle',
    apply: (p) => set(p, 'spindle', { depth: 2.6, speed: 12500, feed: 3200 }),
  },
  {
    id: 'spindleBearing',
    labelKey: 'presets.spindleBearing',
    component: 'spindle',
    apply: (p) => set(p, 'spindle', { bearingWear: 80 }),
  },
  {
    id: 'tableEcc',
    labelKey: 'presets.tableEcc',
    component: 'table',
    apply: (p) => set(p, 'table', { load: 160, eccentricity: 16, speed: 20 }),
  },
  {
    id: 'cavitation',
    labelKey: 'presets.cavitation',
    component: 'bomba1',
    apply: (p) => set(p, 'bomba1', { tankLevel: 8 }),
  },
  {
    id: 'b2bearing',
    labelKey: 'presets.b2bearing',
    component: 'bomba2',
    apply: (p) => set(p, 'bomba2', { bearingWear: 88 }),
  },
  {
    id: 'b2overpressure',
    labelKey: 'presets.b2overpressure',
    component: 'bomba2',
    apply: (p) => set(p, 'bomba2', { pressure: 150, frequency: 58 }),
  },
  {
    id: 'b3misalign',
    labelKey: 'presets.b3misalign',
    component: 'bomba3',
    apply: (p) => set(p, 'bomba3', { misalignment: 0.55 }),
  },
];

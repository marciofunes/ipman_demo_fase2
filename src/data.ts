// Repository boundary: all demo domain data lives here. Components consume this
// contract; replace demoRepository methods with an API adapter when needed.
/** Machine and sensor profiles: two healthy CNCs, mechanical/electrical faults,
 * one critical CNC, plus distinct acquisition failures on deburring equipment.
 * Each sensor tuple is [RMS acceleration mm/s², availability %, gaps, frozen, clipping, sync errors]. */
export const machineProfiles = [
  {
    name: 'GROB G300 • 01',
    state: 'Normal',
    issue: 'Operação estável',
    sensors: {
      Spindle: [1.25, 99.98, 0, 0, 0, 0],
      'Bomba 1': [0.85, 99.99, 0, 0, 0, 0],
      'Bomba 2': [1.1, 99.95, 0, 0, 0, 0],
      'Bomba 3': [1.45, 99.97, 0, 0, 0, 0],
    },
  },
  {
    name: 'GROB G300 • 02',
    state: 'Normal',
    issue: 'Operação estável',
    sensors: {
      Spindle: [1.9, 99.9, 0, 0, 0, 0],
      'Bomba 1': [1.35, 99.85, 0, 0, 0, 0],
      'Bomba 2': [1.65, 99.92, 0, 0, 0, 0],
      'Bomba 3': [1.15, 99.88, 0, 0, 0, 0],
    },
  },
  {
    name: 'GROB G300 • 03',
    state: 'Atenção',
    issue: 'Cavitação e desalinhamento',
    sensors: {
      Spindle: [3.7, 97.5, 2, 0, 0, 1],
      'Bomba 1': [5.6, 93.2, 7, 0, 3, 2],
      'Bomba 2': [4.3, 96.7, 3, 2, 0, 1],
      'Bomba 3': [2.1, 99.2, 1, 0, 0, 0],
    },
  },
  {
    name: 'GROB G300 • 04',
    state: 'Crítico',
    issue: 'Rolamento crítico e sobrecarga',
    sensors: {
      Spindle: [10.8, 82.4, 21, 4, 12, 8],
      'Bomba 1': [5.1, 94.1, 8, 1, 4, 2],
      'Bomba 2': [12.6, 74.6, 32, 11, 18, 12],
      'Bomba 3': [7.8, 88.3, 16, 5, 7, 5],
    },
  },
  {
    name: 'Rebarbadora • 01',
    state: 'Atenção',
    issue: 'Perda de pacotes e sinal congelado',
    sensors: {
      'Motor rebarba': [2.8, 87.5, 18, 8, 0, 6],
      'Bomba rebarba': [1.7, 91.2, 12, 5, 0, 3],
    },
  },
  {
    name: 'Rebarbadora • 02',
    state: 'Atenção',
    issue: 'Sobrecarga e saturação do sensor',
    sensors: {
      'Motor rebarba': [6.2, 94.3, 4, 0, 15, 2],
      'Bomba rebarba': [4.4, 96.8, 2, 1, 6, 1],
    },
  },
] as const;
/** Electrical seeds: line-to-line RMS voltage, load multiplier, displacement PF and Hz.
 * Balanced three-phase, sinusoidal supply; branch nominal currents are in amperes. */
export const electricalSeeds = {
  machines: [
    { voltage: 400, load: 0.68, pf: 0.96, frequency: 60 },
    { voltage: 398, load: 0.79, pf: 0.94, frequency: 60.02 },
    { voltage: 389, load: 1.04, pf: 0.84, frequency: 59.94 },
    { voltage: 369, load: 1.31, pf: 0.69, frequency: 59.82 },
    { voltage: 402, load: 0.73, pf: 0.91, frequency: 60.01 },
    { voltage: 381, load: 1.16, pf: 0.79, frequency: 59.91 },
  ],
  nominalCurrent: { Spindle: 28, 'Bomba 1': 6.2, 'Bomba 2': 9.5, 'Bomba 3': 4.1,
    'Motor rebarba': 17, 'Bomba rebarba': 5.5 } as Record<string, number>,
};
export function assetOptions(machine: string) {
  return [
    ...new Set(
      machineProfiles
        .filter((p) => !machine || p.name === machine)
        .flatMap((p) => Object.keys(p.sensors)),
    ),
  ];
}
export type Outcome = 'Aprovado' | 'Reprovado' | 'Revisão';
export type Field = {
  id: string;
  expected: string;
  detected: string;
  status: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type Inspection = {
  id: string;
  pn: string;
  date: string;
  time: string;
  result: Outcome;
  reason: string;
  version: number;
  fields: Field[];
  review?: { note: string; result: Outcome };
};
export type Reference = {
  version: number;
  date: string;
  author: string;
  comment: string;
  pns: Record<
    string,
    {
      client: string;
      family: string;
      fields: { id: string; value: string; use: string }[];
    }
  >;
};
const fields: Field[] = [
  {
    id: 'Field 0',
    expected: '2BP',
    detected: '2BP',
    status: 'Conforme',
    x: 70,
    y: 71,
    w: 9,
    h: 6,
  },
  {
    id: 'Field 1',
    expected: '265258072',
    detected: '265258072',
    status: 'Conforme',
    x: 39,
    y: 7,
    w: 24,
    h: 6,
  },
  {
    id: 'Field 2',
    expected: 'VL',
    detected: 'VL',
    status: 'Conforme',
    x: 25,
    y: 60,
    w: 8,
    h: 8,
  },
  {
    id: 'Field 3',
    expected: '908',
    detected: '908',
    status: 'Conforme',
    x: 26,
    y: 69,
    w: 7,
    h: 5,
  },
  {
    id: 'Field 5',
    expected: '269 966',
    detected: '269 966',
    status: 'Conforme',
    x: 24,
    y: 80,
    w: 17,
    h: 6,
  },
  {
    id: 'Field 6',
    expected: 'HR',
    detected: 'HR',
    status: 'Conforme',
    x: 7,
    y: 74,
    w: 9,
    h: 8,
  },
  {
    id: 'Field 7',
    expected: 'HL',
    detected: 'HL',
    status: 'Conforme',
    x: 86,
    y: 77,
    w: 8,
    h: 8,
  },
  {
    id: 'Field 8',
    expected: 'HZ1',
    detected: 'HZ7',
    status: 'Divergente',
    x: 14,
    y: 88,
    w: 13,
    h: 9,
  },
  {
    id: 'Field 9',
    expected: 'HZ2',
    detected: 'HZ2',
    status: 'Conforme',
    x: 81,
    y: 87,
    w: 12,
    h: 8,
  },
  {
    id: 'Field 10',
    expected: 'VW AG',
    detected: 'VW AG',
    status: 'Qualidade baixa',
    x: 49,
    y: 82,
    w: 31,
    h: 14,
  },
  {
    id: 'Field 11',
    expected: 'VR',
    detected: '—',
    status: 'Não detectado',
    x: 72,
    y: 61,
    w: 9,
    h: 9,
  },
];
const inspections: Inspection[] = [
  ['054631', '265258072', '14:32:08', 'Reprovado', 'HZ1 • qualidade VW AG', 12],
  ['054630', '265258072', '14:31:51', 'Aprovado', '—', 12],
  ['054629', '265294488', '14:31:28', 'Aprovado', '—', 12],
  ['054628', '265258072', '14:30:54', 'Revisão', 'PN baixa confiança', 12],
  ['054627', '265259836', '14:30:31', 'Reprovado', 'Field 12 divergente', 11],
].map(([id, pn, time, result, reason, version]) => ({
  id: `2026-${id}`,
  pn: String(pn),
  date: '2026-09-24',
  time: String(time),
  result: result as Outcome,
  reason: String(reason),
  version: Number(version),
  fields: fields.map((f) =>
    result === 'Aprovado'
      ? { ...f, detected: f.expected, status: 'Conforme' }
      : result === 'Revisão'
        ? {
            ...f,
            status: f.id === 'Field 1' ? 'Qualidade baixa' : 'Conforme',
            detected: f.expected,
          }
        : id === '054627'
          ? {
              ...f,
              expected: f.id === 'Field 8' ? 'HZ1' : f.expected,
              detected: f.id === 'Field 8' ? 'HZ2' : f.expected,
              status: f.id === 'Field 8' ? 'Divergente' : 'Conforme',
            }
          : { ...f },
  ),
}));
// Eight-hour production window: 480 pieces, approximately 60 pieces/hour.
// Keep the five original evidence cases; older records have unique IDs and immutable evidence.
const inspectionHistory: Inspection[] = [
  ...inspections,
  ...Array.from({ length: 475 }, (_, index): Inspection => {
    const template = inspections[index % 37 === 0 ? 3 : index % 19 === 0 ? 4 : index % 2 + 1];
    const timestamp = new Date(Date.UTC(2026, 8, 24, 14, 30, 31) - (index + 1) * 60000);
    return { ...template, id: `2026-${String(54626 - index).padStart(6, '0')}`,
      date: timestamp.toISOString().slice(0, 10), time: timestamp.toISOString().slice(11, 19),
      fields: template.fields.map(field => ({ ...field,
        ...(field.id === 'Field 1' ? { expected: template.pn, detected: template.pn } : {}) })),
    };
  }),
];
const pns = Object.fromEntries(
  ['265258072', '265294488', '265259836'].map((pn, i) => [
    pn,
    {
      client: i === 2 ? 'Stellantis' : 'VW',
      family: 'ESP9-6',
      fields: [
        { id: 'Field 0', value: 'ESP', use: 'Identificação' },
        { id: 'Field 1', value: pn, use: 'Part Number' },
        ...[
          '269 966',
          'HR',
          'HL',
          'HZ1',
          'HZ2',
          'VW AG',
          'VR',
          '2BP',
          '908',
          'VL',
          '200 614 517 BD',
          '260508/1/1658',
          'DE',
          '2026',
          'B01',
        ].map((v, j) => ({ id: `Field ${j + 5}`, value: v, use: 'Gravação' })),
      ],
    },
  ]),
);
export const mockData = {
  analytics: {
    investigations: 2,
    baseline: {
      condition: 'Clean',
      outliers: 2,
      trend: 'Crescente',
      version: 'v1.2',
      coverage: 96,
    },
    investigation: {
      duration: 3.2,
      severity: 'Investigação',
      origin: 'Alerta IPMAN',
      quality: 'Adequada',
      status: 'Em análise',
    },
    events: [
      ['Vibração', 'desvio persistente', '11:20'],
      ['Elétrica', 'variação correlacionada', '12:10'],
      ['Inspeção', 'ruído anormal registrado', '14:05'],
    ],
    distribution: Array.from({ length: 18 }, (_, i) => ({
      baseline: Math.exp(-(((i - 7) / 4) ** 2)),
      current: Math.exp(-(((i - 10) / 4) ** 2)),
    })),
    featureCondition: Array.from({ length: 6 }, (_, i) =>
      Array.from({ length: 6 }, (_, j) =>
        i === 2 && j < 2 ? 'hot' : (i + j) % 4 === 0 ? 'warm' : 'cool',
      ),
    ),
    temporalCondition: Array.from({ length: 6 }, (_, i) =>
      Array.from({ length: 18 }, (_, j) =>
        i === 2 && j > 9 ? 'hot' : j % 7 === i ? 'warm' : 'cool',
      ),
    ),
  },
  plant: {
    machines: [
      'GROB G300 • 01',
      'GROB G300 • 02',
      'GROB G300 • 03',
      'GROB G300 • 04',
      'Rebarbadora • 01',
      'Rebarbadora • 02',
    ],
    assets: ['Spindle', 'Bomba 1', 'Bomba 2', 'Bomba 3', 'Motor rebarba', 'Bomba rebarba'].map(
      (name, i) => ({
        name,
        status: i === 2 ? 'Atenção' : 'Normal',
        availability: [99.8, 99.5, 96.2, 99.9, 98.7, 99.4][i],
        rms: [2.1, 1.8, 4.2, 1.6, 2.7, 1.9][i],
      }),
    ),
    queue: [
      { asset: 'Bomba 2', reason: 'desvio persistente' },
      { asset: 'Spindle', reason: 'tendência crescente' },
      { asset: 'Elétrica', reason: 'gap na coleta' },
    ],
    series: Array.from({ length: 48 }, (_, i) => 2 + Math.sin(i * 0.6) * 0.22 + i * 0.025),
    metrics: { current: 12.4, power: 7.8, pf: 0.92 },
    quality: { windows: 98.6, gaps: 3, frozen: 1, clipping: 0 },
  },
  inspection: {
    inspections,
    history: inspectionHistory,
    today: 1284,
    approved: 1251,
    rejected: 28,
    review: 5,
    image: '/reference/workpiece.jpeg',
  },
  references: [
    {
      version: 12,
      date: '2026-09-24',
      author: 'Bosch',
      comment: 'atualização de PNs VW / Stellantis',
      pns,
    },
    {
      version: 11,
      date: '2026-09-18',
      author: 'Bosch',
      comment: 'Configuração inicial',
      pns,
    },
  ] as Reference[],
  simulation: {
    defaults: { rpm: 6000, load: 60, table: 6 },
    limits: { rpm: [1500, 12000], load: [20, 100], table: [1, 15] },
    baseline: { rms: 2.1, current: 12.4, power: 7.8, pf: 0.92 },
  },
};
/** Timestamp current results in local time; preserve the historical sample records. */
export function currentInspection(sample: Inspection, now = new Date()): Inspection {
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    ...structuredClone(sample),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  };
}
export const demoRepository = {
  async inspect(index: number) {
    await new Promise((r) => setTimeout(r, 650));
    return currentInspection(inspections[index % inspections.length]);
  },
};
export function validateReference(value: unknown): value is { pns: Reference['pns'] } {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'pns')) return false;
  const p = (value as { pns: unknown }).pns;
  if (!p || typeof p !== 'object' || Array.isArray(p) || !Object.keys(p).length) return false;
  return Object.entries(p).every(([pn, v]) => {
    if (
      !/^\d{9}$/.test(pn) ||
      !v ||
      typeof v !== 'object' ||
      typeof v.client !== 'string' ||
      typeof v.family !== 'string' ||
      !Array.isArray(v.fields) ||
      !v.fields.length ||
      v.fields.length > 1000
    )
      return false;
    const fieldsValid = v.fields.every((f: unknown) => {
      if (!f || typeof f !== 'object') return false;
      const field = f as Record<string, unknown>;
      return (
        typeof field.id === 'string' &&
        field.id.length > 0 &&
        typeof field.value === 'string' &&
        typeof field.use === 'string' &&
        ['Identificação', 'Part Number', 'Gravação'].includes(field.use)
      );
    });
    return (
      fieldsValid && new Set(v.fields.map((f: { id: string }) => f.id)).size === v.fields.length
    );
  });
}

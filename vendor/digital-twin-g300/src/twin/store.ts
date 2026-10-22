import { create } from 'zustand';
import { twinNoise } from '../mocks';
import {
  COMPONENTS,
  PRESETS,
  classify,
  defaultParams,
  evaluateAll,
  machineElectrical,
  type ComponentId,
  type Readings,
  type TwinParams,
} from './whatif';

export interface CycleInfo {
  face: number;
  phase: 'index' | 'approach' | 'cut' | 'retract' | 'tilt';
  parts: number;
  progress: number;
}

export type CameraPreset = 'overview' | 'workarea' | 'service' | 'xray';

export interface LiveReadings extends Readings {
  t: number;
}

interface TwinState {
  params: TwinParams;
  selected: ComponentId;
  xray: boolean;
  labels: boolean;
  camera: CameraPreset;
  cameraNonce: number;
  /** leituras ao vivo (modelo + ruído de medição), atualizadas a cada 1 s */
  live: Record<ComponentId, LiveReadings>;
  history: Record<ComponentId, { t: number; rms: number; kurtosis: number }[]>;
  electrical: ReturnType<typeof machineElectrical>;
  activePreset: string | null;
  cycle: CycleInfo;
  setCycle: (c: CycleInfo) => void;
  setParam: (id: ComponentId, key: string, value: number) => void;
  applyPreset: (presetId: string) => void;
  resetComponent: (id: ComponentId) => void;
  select: (id: ComponentId) => void;
  toggleXray: () => void;
  toggleLabels: () => void;
  setCamera: (c: CameraPreset) => void;
  sample: (nowS: number) => void;
}

const HISTORY = 60;

function measure(params: TwinParams, nowS: number) {
  const model = evaluateAll(params);
  const live = {} as Record<ComponentId, LiveReadings>;
  for (const c of COMPONENTS) {
    const m = model[c.id];
    const rms = Math.max(0.05, m.rms * (1 + twinNoise(c.id, 'rms', nowS)));
    const kurtosis = Math.max(2.5, m.kurtosis * (1 + twinNoise(c.id, 'kurtosis', nowS)));
    const crest = Math.max(2, m.crest * (1 + twinNoise(c.id, 'crest', nowS)));
    const current = m.current * (1 + twinNoise(c.id, 'current', nowS));
    const power = m.power * (1 + twinNoise(c.id, 'power', nowS));
    const pf = Math.min(0.99, m.pf + twinNoise(c.id, 'pf', nowS));
    const voltage = m.voltage * (1 + 0.004 * Math.sin(nowS / 7));
    const cls = classify(rms, kurtosis, m.load);
    live[c.id] = { ...m, rms, kurtosis, crest, current, power, pf, voltage, apparent: power / pf, status: cls.status, severity: cls.severity, t: nowS };
  }
  return { live, electrical: machineElectrical(live) };
}

const initialParams = defaultParams();
const initialNow = Math.floor(Date.now() / 1000);
const first = measure(initialParams, initialNow);

function seedHistory(params: TwinParams, nowS: number) {
  const h = {} as TwinState['history'];
  for (const c of COMPONENTS) h[c.id] = [];
  for (let i = HISTORY - 1; i >= 0; i -= 1) {
    const m = measure(params, nowS - i).live;
    for (const c of COMPONENTS) h[c.id].push({ t: nowS - i, rms: m[c.id].rms, kurtosis: m[c.id].kurtosis });
  }
  return h;
}

export const useTwin = create<TwinState>((set, get) => ({
  params: initialParams,
  selected: 'spindle',
  xray: false,
  labels: true,
  camera: 'overview',
  cameraNonce: 0,
  live: first.live,
  electrical: first.electrical,
  history: seedHistory(initialParams, initialNow),
  activePreset: 'current',
  cycle: { face: 0, phase: 'index', parts: 0, progress: 0 },
  setCycle: (cycle) => set({ cycle }),
  setParam: (id, key, value) => {
    set((s) => ({ params: { ...s.params, [id]: { ...s.params[id], [key]: value } }, activePreset: null }));
    get().sample(Math.floor(Date.now() / 1000));
  },
  applyPreset: (presetId) => {
    const p = PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    set((s) => ({ params: p.apply(s.params), activePreset: presetId, selected: p.component === 'all' ? s.selected : p.component }));
    get().sample(Math.floor(Date.now() / 1000));
  },
  resetComponent: (id) => {
    set((s) => ({ params: { ...s.params, [id]: defaultParams()[id] }, activePreset: null }));
    get().sample(Math.floor(Date.now() / 1000));
  },
  select: (selected) => set({ selected }),
  toggleXray: () => set((s) => ({ xray: !s.xray })),
  toggleLabels: () => set((s) => ({ labels: !s.labels })),
  setCamera: (camera) => set((s) => ({ camera, cameraNonce: s.cameraNonce + 1 })),
  sample: (nowS) => {
    const { live, electrical } = measure(get().params, nowS);
    set((s) => {
      const history = { ...s.history };
      for (const c of COMPONENTS) {
        const arr = s.history[c.id];
        const last = arr[arr.length - 1];
        const point = { t: nowS, rms: live[c.id].rms, kurtosis: live[c.id].kurtosis };
        history[c.id] = last && last.t === nowS ? [...arr.slice(0, -1), point] : [...arr.slice(-(HISTORY - 1)), point];
      }
      return { live, electrical, history };
    });
  },
}));

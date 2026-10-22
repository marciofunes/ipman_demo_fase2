import { describe, expect, it } from 'vitest';
import { CycleMachine, indexSeconds } from './twin/cycle';
import {
  PRESETS,
  THRESHOLDS,
  VOLTAGE,
  cavitation,
  classify,
  cycleSeconds,
  defaultParams,
  electrical,
  evaluate,
  evaluateAll,
  machineElectrical,
  pumpModel,
  spindleModel,
  stabilityLimit,
} from './twin/whatif';

describe('modelo what-if', () => {
  it('cenário atual: Bomba 2 em atenção e demais componentes normais', () => {
    const r = evaluateAll(defaultParams());
    expect(r.bomba2.status).toBe('attention');
    expect(r.spindle.status).toBe('normal');
    expect(r.table.status).toBe('normal');
    expect(r.bomba1.status).toBe('normal');
    expect(r.bomba3.status).toBe('normal');
  });

  it('desbalanceamento cresce com o quadrado da rotação', () => {
    const p = { ...defaultParams().spindle, unbalance: 80 };
    const c = (speed: number) =>
      spindleModel({ ...p, speed }).contributions.find((x) => x.key === 'mech.unbalance')!.value;
    expect(c(16000) / c(8000)).toBeCloseTo(4, 5);
  });

  it('desgaste de rolamento eleva curtose e fator de crista (impulsividade)', () => {
    const base = defaultParams().spindle;
    const healthy = spindleModel({ ...base, bearingWear: 0 });
    const worn = spindleModel({ ...base, bearingWear: 90 });
    expect(worn.kurtosis).toBeGreaterThan(THRESHOLDS.kurtosis.critical);
    expect(worn.crest).toBeGreaterThan(healthy.crest);
    expect(worn.status).toBe('critical');
  });

  it('chatter aparece quando a profundidade passa do limite de estabilidade', () => {
    const base = defaultParams().spindle;
    const speed = 12500;
    const limit = stabilityLimit(speed);
    expect(spindleModel({ ...base, speed, depth: limit - 0.2 }).chatter).toBe(false);
    const r = spindleModel({ ...base, speed, depth: limit + 1 });
    expect(r.chatter).toBe(true);
    expect(r.rms).toBeGreaterThan(spindleModel({ ...base, speed, depth: limit - 0.2 }).rms + 2);
  });

  it('potência de corte cresce com avanço e profundidade', () => {
    const base = defaultParams().spindle;
    expect(spindleModel({ ...base, feed: 4800 }).power).toBeGreaterThan(spindleModel(base).power);
    expect(spindleModel({ ...base, depth: 3 }).power).toBeGreaterThan(spindleModel(base).power);
  });

  it('grandezas elétricas trifásicas são consistentes (S² = P² + Q², I = S/√3V)', () => {
    const e = electrical(8, 11);
    expect(e.apparent ** 2).toBeCloseTo(8 ** 2 + e.reactive ** 2, 6);
    expect(e.current).toBeCloseTo((e.apparent * 1000) / (Math.sqrt(3) * VOLTAGE), 6);
    expect(e.pf).toBeGreaterThan(0.35);
    expect(e.pf).toBeLessThanOrEqual(0.9);
  });

  it('cavitação só surge com nível de tanque baixo e eleva vibração e curtose', () => {
    expect(cavitation(85)).toBe(0);
    expect(cavitation(10)).toBe(1);
    const p = defaultParams().bomba1;
    const ok = pumpModel('bomba1', p);
    const cav = pumpModel('bomba1', { ...p, tankLevel: 10 });
    expect(cav.rms - ok.rms).toBeGreaterThan(2.5);
    expect(cav.kurtosis).toBeGreaterThan(ok.kurtosis + 3);
  });

  it('frequência do inversor muda a rotação do eixo', () => {
    const p = defaultParams().bomba3;
    expect(pumpModel('bomba3', { ...p, frequency: 60 }).shaftRpm).toBeGreaterThan(
      pumpModel('bomba3', p).shaftRpm,
    );
  });

  it('classificação segue os limiares ISO 10816 e de curtose', () => {
    expect(classify(2.0, 3.2, 0.5).status).toBe('normal');
    expect(classify(3.0, 3.2, 0.5).status).toBe('attention');
    expect(classify(5.0, 3.2, 0.5).status).toBe('critical');
    expect(classify(2.0, 6.5, 0.5).status).toBe('critical');
    expect(classify(2.0, 3.2, 1.2).status).toBe('critical');
  });

  it('cada cenário pronto leva o componente-alvo para fora do normal', () => {
    for (const p of PRESETS.filter((x) => x.component !== 'all')) {
      const r = evaluate(
        p.component as Exclude<typeof p.component, 'all'>,
        p.apply(defaultParams())[p.component as Exclude<typeof p.component, 'all'>],
      );
      expect(r.status, p.id).not.toBe('normal');
    }
    const healthy = evaluateAll(PRESETS.find((p) => p.id === 'healthy')!.apply(defaultParams()));
    Object.values(healthy).forEach((r) => expect(r.status).toBe('normal'));
  });

  it('medidor trifásico soma as potências dos componentes', () => {
    const r = evaluateAll(defaultParams());
    const m = machineElectrical(r);
    const sumP = Object.values(r).reduce((s, x) => s + x.power, 0);
    expect(m.power).toBeGreaterThan(sumP);
    expect(m.pf).toBeGreaterThan(0.5);
    expect(m.pf).toBeLessThan(1);
  });

  it('tempos de ciclo respondem ao avanço e à velocidade da mesa', () => {
    expect(cycleSeconds({ ...defaultParams().spindle, feed: 4800 })).toBeLessThan(
      cycleSeconds(defaultParams().spindle),
    );
    expect(indexSeconds(20)).toBeLessThan(indexSeconds(5));
  });
});

describe('ciclo de usinagem na mesa giratória', () => {
  it('percorre indexação, aproximação, corte e retorno e gira a mesa 90° por face', () => {
    const m = new CycleMachine();
    const seen = new Set<string>();
    let s = m.advance(0, 2, 1);
    expect(s.phase).toBe('index');
    for (let i = 0; i < 400; i += 1) {
      s = m.advance(0.05, 2, 1);
      seen.add(s.phase);
      if (s.face === 1 && s.phase === 'approach') break;
    }
    expect([...seen]).toEqual(expect.arrayContaining(['index', 'approach', 'cut', 'retract']));
    expect(s.B).toBeCloseTo(Math.PI, 5); // duas indexações completas
  });

  it('inclina o berço na face de topo e conta a peça ao final', () => {
    const m = new CycleMachine();
    let s = m.advance(0, 1, 0.5);
    let minA = 0;
    for (let i = 0; i < 2000 && s.parts === 0; i += 1) {
      s = m.advance(0.05, 1, 0.5);
      minA = Math.min(minA, s.A);
    }
    expect(minA).toBeCloseTo(-Math.PI / 2, 2);
    expect(s.parts).toBe(1);
  });
});

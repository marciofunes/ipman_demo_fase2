import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import LineChart from '../components/charts/LineChart';
import { Loading } from '../components/ErrorBoundary';
import { CrumbBar, Kpi, PageHead, statusTone } from '../components/ui';
import { useApp } from '../data/store';
import { useFormat } from '../i18n';
import { useTwin, type CameraPreset } from '../twin/store';
import { COMPONENTS, PRESETS, THRESHOLDS, type ComponentId } from '../twin/whatif';

const G300Scene = lazy(() => import('../three/G300Scene'));

const CAMS: CameraPreset[] = ['overview', 'workarea', 'service', 'xray'];

function WhatIfPanel() {
  const { t } = useTranslation();
  const fmt = useFormat();
  const selected = useTwin((s) => s.selected);
  const params = useTwin((s) => s.params[selected]);
  const select = useTwin((s) => s.select);
  const setParam = useTwin((s) => s.setParam);
  const applyPreset = useTwin((s) => s.applyPreset);
  const resetComponent = useTwin((s) => s.resetComponent);
  const activePreset = useTwin((s) => s.activePreset);
  const live = useTwin((s) => s.live);
  const history = useTwin((s) => s.history[selected]);
  const def = COMPONENTS.find((c) => c.id === selected)!;
  const r = live[selected];
  const presets = PRESETS.filter((p) => p.component === 'all' || p.component === selected);
  const contrib = [...r.contributions]
    .sort((a, b) => b.value - a.value)
    .filter((c) => c.value > 0.02);
  const total = contrib.reduce((s, c) => s + c.value, 0) || 1;
  const palette = ['#0b7dc2', '#e07b10', '#6b4aa8', '#1e8a55', '#c9413b', '#8a98a6'];

  return (
    <aside className="twin-side" aria-label={t('twin.scenarios')}>
      <h2>{t('twin.scenarios')}</h2>
      <div className="twin-comps" role="radiogroup" aria-label={t('twin.component')}>
        {COMPONENTS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected === c.id}
            className={`comp-chip ${live[c.id].status}${selected === c.id ? ' on' : ''}`}
            onClick={() => select(c.id)}
            data-testid={`comp-${c.id}`}
          >
            <i className={`dot sm ${live[c.id].status}`} />
            {t(`twin.componentsShort.${c.id}`)}
          </button>
        ))}
      </div>
      <div className="twin-presets" aria-label={t('twin.presets')}>
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`preset${activePreset === p.id ? ' on' : ''}`}
            onClick={() => applyPreset(p.id)}
            data-testid={`preset-${p.id}`}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>
      <div className="twin-params">
        <div className="twin-params-head">
          <span>{t(def.labelKey)}</span>
          <button type="button" className="btn ghost sm" onClick={() => resetComponent(selected)}>
            {t('twin.reset')}
          </button>
        </div>
        {def.params.map((p) => {
          const v = params[p.key];
          const digits = p.step < 0.1 ? 2 : p.step < 1 ? 1 : 0;
          return (
            <label key={p.key} className="slider">
              <span className="slider-top">
                <span>{t(p.labelKey)}</span>
                <b>
                  {fmt.num(v, digits)} <small>{p.unit}</small>
                </b>
              </span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={v}
                onChange={(e) => setParam(selected, p.key, Number(e.target.value))}
                aria-label={t(p.labelKey)}
                data-testid={`param-${p.key}`}
              />
            </label>
          );
        })}
      </div>
      <div className="twin-chart">
        <div className="twin-chart-head">
          <span>{t('twin.rmsLive')}</span>
          <span className="legend">
            <span>
              <i style={{ background: '#e07b10' }} />
              {t('twin.attentionAt', { v: fmt.num(THRESHOLDS.rms.attention, 1) })}
            </span>
            <span>
              <i style={{ background: '#c9413b' }} />
              {t('twin.criticalAt', { v: fmt.num(THRESHOLDS.rms.critical, 1) })}
            </span>
          </span>
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <LineChart
            ariaLabel={t('twin.rmsLive')}
            series={[
              {
                id: 'rms',
                points: history.map((h) => ({ t: h.t * 1000, v: h.rms })),
                color:
                  r.status === 'normal'
                    ? '#0b7dc2'
                    : r.status === 'attention'
                      ? '#e07b10'
                      : '#c9413b',
                fill: true,
              },
            ]}
            domain={[0, Math.max(6, ...history.map((h) => h.rms * 1.15))]}
            thresholds={[
              { v: THRESHOLDS.rms.attention, color: '#e07b10' },
              { v: THRESHOLDS.rms.critical, color: '#c9413b' },
            ]}
            showY
            showAxis={false}
          />
        </div>
      </div>
      <div className="twin-contrib">
        <span>{t('twin.contributions')}</span>
        <div className="contrib-bar" role="img" aria-label={t('twin.contributions')}>
          {contrib.map((c, i) => (
            <span
              key={c.key}
              style={{
                width: `${(c.value / total) * 100}%`,
                background: palette[i % palette.length],
              }}
              title={`${t(c.key)}: ${fmt.num(c.value, 2)} mm/s`}
            />
          ))}
        </div>
        <div className="legend">
          {contrib.slice(0, 4).map((c, i) => (
            <span key={c.key}>
              <i style={{ background: palette[i % palette.length] }} />
              {t(c.key)} {fmt.num(c.value, 1)}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

function CycleStatus() {
  const { t } = useTranslation();
  const cycle = useTwin((s) => s.cycle);
  const chatter = useTwin((s) => s.live.spindle.chatter);
  return (
    <div className="twin-cycle" aria-live="polite" data-testid="machining-cycle" data-completed={cycle.completed} data-total={cycle.total} data-parts={cycle.parts}>
      <span className="tc-title">{t('twin.cycle')}</span>
      <span>
        {t('twin.phase')}: <b data-testid="cycle-phase">{t(`twin.phases.${cycle.phase}`)}</b> ·{' '}
        {t('twin.holes')}: {cycle.completed}/{cycle.total} · {t('twin.parts')}: <b>{cycle.parts}</b>
      </span>
      <div className="bar-track" style={{ height: '0.3rem', borderRadius: 4 }}>
        <div
          className="bar-fill"
          style={{ width: `${cycle.progress * 100}%`, transition: 'width 0.3s linear' }}
        />
      </div>
      {chatter && <span className="chatter">⚠ {t('twin.chatter')}</span>}
    </div>
  );
}

function Toolbar() {
  const { t } = useTranslation();
  const xray = useTwin((s) => s.xray);
  const labels = useTwin((s) => s.labels);
  const toggleXray = useTwin((s) => s.toggleXray);
  const toggleLabels = useTwin((s) => s.toggleLabels);
  const camera = useTwin((s) => s.camera);
  const setCamera = useTwin((s) => s.setCamera);
  return (
    <>
      <div className="twin-toolbar left" role="group" aria-label={t('twin.camera')}>
        {CAMS.map((c) => (
          <button
            key={c}
            type="button"
            className={`btn sm ${camera === c ? 'on' : 'ghost'}`}
            onClick={() => setCamera(c)}
          >
            {t(`twin.cameras.${c}`)}
          </button>
        ))}
      </div>
      <div className="twin-toolbar right">
        <button
          type="button"
          className={`btn sm xray-btn${xray ? ' on' : ''}`}
          aria-pressed={xray}
          onClick={toggleXray}
          data-testid="xray"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          {t('twin.xray')}
        </button>
        <button
          type="button"
          className={`btn sm ${labels ? 'on' : 'ghost'}`}
          aria-pressed={labels}
          onClick={toggleLabels}
        >
          {t('twin.labels')}
        </button>
      </div>
    </>
  );
}

export default function DigitalTwin() {
  const { t } = useTranslation();
  const fmt = useFormat();
  const nowS = useApp((s) => s.nowS);
  const [pane, setPane] = useState('model');
  const sample = useTwin((s) => s.sample);
  const selected = useTwin((s) => s.selected);
  const r = useTwin((s) => s.live[selected]);

  // a cada segundo o gêmeo "mede" (modelo what-if + ruído de medição)
  useEffect(() => {
    sample(nowS);
  }, [nowS, sample]);

  const name = t(`twin.componentsShort.${selected as ComponentId}`);
  const rmsTone =
    r.rms >= THRESHOLDS.rms.critical
      ? 'red'
      : r.rms >= THRESHOLDS.rms.attention
        ? 'orange'
        : 'green';
  const kTone =
    r.kurtosis >= THRESHOLDS.kurtosis.critical
      ? 'red'
      : r.kurtosis >= THRESHOLDS.kurtosis.attention
        ? 'orange'
        : 'green';

  return (
    <div className="imported-twin" data-pane={pane}>
      <PageHead title={t('twin.title')} subtitle={t('twin.subtitle')} />
      <CrumbBar
        items={[t('references.crumbPlant'), t('machines.g300-01'), t('twin.crumb'), name]}
      />
      <div className="twin-mobile-tabs" role="group" aria-label={t('twin.title')}>
        <button aria-pressed={pane === 'model'} onClick={() => setPane('model')}>
          {t('twin.cameras.overview')}
        </button>
        <button aria-pressed={pane === 'scenarios'} onClick={() => setPane('scenarios')}>
          {t('twin.scenarios')}
        </button>
      </div>
      <div className="content twin-grid">
        <div className="kpis twin-kpis">
          <Kpi
            testId="twin-rms"
            label={t('twin.cards.rms')}
            value={fmt.num(r.rms, 2)}
            unit="mm/s"
            tone={rmsTone}
            sub={name}
          />
          <Kpi
            testId="twin-kurtosis"
            label={t('twin.cards.kurtosis')}
            value={fmt.num(r.kurtosis, 2)}
            tone={kTone}
            sub={name}
          />
          <Kpi label={t('twin.cards.crest')} value={fmt.num(r.crest, 2)} tone="blue" sub={name} />
          <Kpi
            testId="twin-current"
            label={t('twin.cards.current')}
            value={fmt.num(r.current, 1)}
            unit="A"
            tone="blue"
            sub={`${t('twin.voltage')} ${fmt.int(r.voltage)} V`}
          />
          <Kpi
            label={t('twin.cards.power')}
            value={fmt.num(r.power, 2)}
            unit="kW"
            tone={r.load > 1 ? 'orange' : 'blue'}
            sub={`${t('twin.load')} ${fmt.int(r.load * 100)}% · S ${fmt.num(r.apparent, 1)} kVA`}
          />
          <Kpi
            label={t('twin.cards.pf')}
            value={fmt.num(r.pf, 2)}
            tone="purple"
            sub={`Q ${fmt.num(r.reactive, 1)} kvar`}
          />
          <Kpi
            testId="twin-condition"
            label={t('twin.cards.condition')}
            value={t(`status.${r.status}`)}
            tone={statusTone(r.status)}
            sub={`${t('twin.rotation')} ${fmt.int(r.shaftRpm)} rpm`}
          />
        </div>
        <section className="twin-view" aria-label={t('twin.title')}>
          <Suspense fallback={<Loading label={t('twin.loading')} />}>
            <G300Scene />
          </Suspense>
          <Toolbar />
          <CycleStatus />
          <span className="twin-hint">{t('twin.hint')}</span>
        </section>
        <WhatIfPanel />
      </div>
    </div>
  );
}

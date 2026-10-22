import { useState } from 'react';
import { ArrowUpRight, Activity, Check, Clock } from 'lucide-react';
import { useLive, formatClock } from './live';
import { useI18n } from './i18n';
import { Badge, Card, LineChart, Stat } from './ui';
import { queryAnalytics } from './analytics';
export type Filters = { machine: string; asset: string; period: string };
export function Dashboards({
  page,
  filters,
  navigate,
  setAsset,
}: {
  page: string;
  filters: Filters;
  navigate: (s: string) => void;
  setAsset: (s: string) => void;
}) {
  const { t, locale } = useI18n();
  const { tick, now } = useLive();
  const mockData = queryAnalytics(filters, tick);
  const [panel, setPanel] = useState('main');
  const switcher = (
    <div className="dashboard-tabs">
      <button className={panel === 'main' ? 'selected' : ''} onClick={() => setPanel('main')}>
        {t('Painel principal')}
      </button>
      <button className={panel === 'detail' ? 'selected' : ''} onClick={() => setPanel('detail')}>
        {t('Análise detalhada')}
      </button>
    </div>
  );
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [decision, setDecision] = useState('Confirmar hipótese');
  const assets = mockData.plant.assets.filter((a) => !filters.asset || a.name === filters.asset);
  const factor = 1;
  const series = mockData.plant.series;
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 });
  function select(name: string) {
    setAsset(name);
    navigate('Condição dos ativos');
  }
  const context = (
    <div
      className={`analytics-context ${mockData.status === 'Crítico' ? 'critical' : mockData.status === 'Atenção' ? 'attention' : 'healthy'}`}
      data-testid="analytics-context"
    >
      <div>
        <strong>
          {filters.machine || t('Todas as máquinas')} ·{' '}
          {filters.asset ? t(filters.asset) : t('Todos os ativos')}
        </strong>
        <span>
          {t(filters.period)} · {mockData.sensorCount} {t('Sensores')} · {t(mockData.status)}
        </span>
      </div>
      <div className="machine-health-strip">
        {mockData.machines.map((m) => (
          <span
            key={m.name}
            className={
              m.state === 'Crítico' ? 'critical' : m.state === 'Atenção' ? 'attention' : 'healthy'
            }
            title={t(m.issue)}
          >
            {m.name} · {t(m.state)}
          </span>
        ))}
      </div>
    </div>
  );
  const queue = (
    <Card title={t('Fila de investigação')}>
      <div className="queue">
        {!mockData.plant.queue.length && (
          <p className="good">
            {t('Sem ocorrências')} · {t('Operação estável')}
          </p>
        )}
        {mockData.plant.queue.slice(0, 5).map((q, i) => (
          <button
            key={`${q.machine}-${q.asset}`}
            onClick={() => {
              setAsset(q.asset === 'Elétrica' ? 'Spindle' : q.asset);
              navigate('Investigações');
            }}
          >
            <span className="queue-number">0{i + 1}</span>
            <span>
              <strong>{t(q.asset)}</strong>
              <small>
                {q.machine} · {t(q.reason)}
              </small>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
    </Card>
  );
  if (page === 'Visão geral')
    return (
      <div
        className="dashboard-page"
        data-screen={[
          'Visão geral',
          'Qualidade dos dados',
          'Referências',
          'Condição dos ativos',
          'Investigações',
        ].indexOf(page)}
        data-panel={panel}
      >
        {context}
        <div className="page-intro">
          <p>{t('Monitoramento e inteligência operacional')}</p>
        </div>
        <div className="stats four">
          <Stat label={t('Ativos monitorados')} value={assets.length} />
          <Stat
            label={t('Coleta saudável')}
            value={`${assets.filter((a) => a.availability > 98).length} / ${assets.length}`}
            tone="good"
          />
          <Stat
            label={t('Em atenção')}
            value={assets.filter((a) => a.status !== 'Normal').length}
            tone="warning"
          />
          <Stat
            label={t('Investigações')}
            value={mockData.analytics.investigations}
            tone="danger"
          />
        </div>
        <div className="overview-grid">
          <Card title={t('Mapa das máquinas e ativos')}>
            <div className="asset-grid">
              {assets.map((a, i) => (
                <button
                  className={`asset ${a.status === 'Crítico' ? 'critical' : a.status === 'Atenção' ? 'attention' : ''}`}
                  key={a.name}
                  onClick={() => select(a.name)}
                >
                  <div className="asset-top">
                    <Activity size={21} />
                    <span
                      className={`status-dot ${a.status === 'Crítico' ? 'red' : a.status === 'Atenção' ? 'amber' : ''}`}
                    />
                  </div>
                  <strong>{t(a.name)}</strong>
                  <span>{t(a.status)}</span>
                  <div className="asset-bottom">
                    <span>
                      {fmt(a.rms * factor)} <small>mm/s</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </div>
                </button>
              ))}
            </div>
          </Card>
          {queue}
        </div>
        <Card title={t('Tendência consolidada')}>
          <LineChart hours={mockData.hours} values={series} label={t('Tendência consolidada')} />
        </Card>
      </div>
    );
  if (page === 'Qualidade dos dados')
    return (
      <div
        className="dashboard-page"
        data-screen={[
          'Visão geral',
          'Qualidade dos dados',
          'Referências',
          'Condição dos ativos',
          'Investigações',
        ].indexOf(page)}
        data-panel={panel}
      >
        {context}
        <div className="page-intro">
          <p>{t('Confiabilidade da aquisição antes de qualquer interpretação analítica')}</p>
        </div>
        <div className="stats five">
          <Stat
            label={t('Janelas válidas')}
            value={`${fmt(mockData.plant.quality.windows)}%`}
            tone="good"
          />
          <Stat label={t('Gaps')} value={mockData.plant.quality.gaps} tone="warning" />
          <Stat
            label={t('Sincronismo')}
            value={mockData.plant.quality.sync || 'OK'}
            tone={mockData.plant.quality.sync ? 'danger' : 'good'}
          />
          <Stat label={t('Clipping')} value={mockData.plant.quality.clipping} />
          <Stat label={t('Congelados')} value={mockData.plant.quality.frozen} tone="warning" />
        </div>
        <div className="split">
          <Card title={t('Disponibilidade por sensor')}>
            {assets.map((a) => (
              <div className="availability" key={a.name}>
                <span>{t(a.name)}</span>
                <progress max={100} value={a.availability} />
                <strong>{fmt(a.availability)}%</strong>
              </div>
            ))}
          </Card>
          <Card title={t('Matriz de qualidade')}>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      'Sensor',
                      'Completude',
                      'Sincronismo',
                      'Clipping',
                      'Congelados',
                      'Status',
                    ].map((h) => (
                      <th key={h}>{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.name}>
                      <td>{t(a.name)}</td>
                      {[0, 1, 2, 3].map((i) => (
                        <td key={i}>
                          <span
                            className={`status-dot ${[a.quality.gaps, a.quality.sync, a.quality.clipping, a.quality.frozen][i] ? 'red' : ''}`}
                          />
                        </td>
                      ))}
                      <td>
                        <Badge
                          text={
                            a.availability < 90
                              ? 'Crítico'
                              : Object.values(a.quality).some((v) => v > 0)
                                ? 'Atenção'
                                : 'Adequada'
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <Card title={t('Sinal selecionado + eventos de qualidade')}>
          <LineChart
            hours={mockData.hours}
            values={series}
            label={t('Sinal selecionado + eventos de qualidade')}
          />
          <p className="event-line">
            <Clock size={15} /> {t(filters.period)} · {mockData.plant.quality.gaps} {t('Gaps')} ·{' '}
            {mockData.plant.quality.frozen} {t('Congelados')} · {mockData.plant.quality.clipping}{' '}
            {t('Clipping')}
          </p>
        </Card>
      </div>
    );
  if (page === 'Referências')
    return (
      <div
        className="dashboard-page"
        data-screen={[
          'Visão geral',
          'Qualidade dos dados',
          'Referências',
          'Condição dos ativos',
          'Investigações',
        ].indexOf(page)}
        data-panel={panel}
      >
        {context}
        <div className="page-intro">
          <p>{t('Comparação com o comportamento de referência em condições equivalentes')}</p>
        </div>
        <div className="stats five">
          <Stat label={t('Condição de referência')} value={mockData.analytics.baseline.condition} />
          <Stat
            label={t('Features fora')}
            value={mockData.analytics.baseline.outliers}
            tone="warning"
          />
          <Stat label={t('Tendência')} value={t(mockData.analytics.baseline.trend)} />
          <Stat label={t('Referência')} value={mockData.analytics.baseline.version} tone="purple" />
          <Stat
            label={t('Cobertura')}
            value={`${fmt(mockData.analytics.baseline.coverage)}%`}
            tone="good"
          />
        </div>
        <Card title={t('Série temporal + envelope de referência')}>
          <LineChart
            hours={mockData.hours}
            values={series}
            reference
            label={t('Série temporal + envelope de referência')}
          />
        </Card>
        <div className="split">
          <Card title={t('Distribuição atual × referência')}>
            <div
              className="distribution"
              role="img"
              aria-label={t('Distribuição atual × referência')}
            >
              {mockData.analytics.distribution.map((v, i) => (
                <div key={i}>
                  <i
                    style={{
                      height: `${v.baseline * 140}px`,
                    }}
                  />
                  <b
                    style={{
                      height: `${v.current * 140}px`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <span>
                <i className="green-dot" />
                {t('Referência')}
              </span>
              <span>
                <i className="blue-dot" />
                {t('Atual')}
              </span>
            </div>
          </Card>
          <Card title={t('Heatmap ativo × feature')}>
            <div className="heatmap">
              <div className="heat-row">
                <span />
                {['RMS', 'Kurtosis', 'Crest', 'Corrente', 'Potência', 'FP'].map((s) => (
                  <small key={s}>{t(s)}</small>
                ))}
              </div>
              {assets.map((a, i) => (
                <div className="heat-row" key={a.name}>
                  <span>{t(a.name)}</span>
                  {mockData.analytics.featureCondition[
                    mockData.plant.assets.findIndex((asset) => asset.name === a.name)
                  ].map((condition, j) => (
                    <div key={j} className={condition} title={`${t(a.name)} · ${j + 1}`} />
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  if (page === 'Condição dos ativos')
    return (
      <div
        className="dashboard-page"
        data-screen={[
          'Visão geral',
          'Qualidade dos dados',
          'Referências',
          'Condição dos ativos',
          'Investigações',
        ].indexOf(page)}
        data-panel={panel}
      >
        {context}
        <div className="page-intro">
          <p>{t('Priorização baseada em severidade, persistência, evidência e qualidade')}</p>
        </div>
        <div className="condition-grid">
          {assets.map((a) => (
            <Card key={a.name}>
              <h3>{t(a.name)}</h3>
              <Badge text={a.status} />
              <strong className="condition-value">
                {fmt(a.rms)} <small>mm/s</small>
              </strong>
              <button
                className="text-link"
                onClick={() => {
                  setAsset(a.name);
                  navigate('Investigações');
                }}
              >
                {t('Ver evidências')} <ArrowUpRight size={14} />
              </button>
            </Card>
          ))}
        </div>
        <div className="overview-grid">
          <Card title={t('Heatmap temporal de condição')}>
            <div className="heatmap timeline-map">
              {assets.map((a, i) => (
                <div className="heat-row" key={a.name}>
                  <span>{t(a.name)}</span>
                  {mockData.analytics.temporalCondition[
                    mockData.plant.assets.findIndex((asset) => asset.name === a.name)
                  ].map((condition, j) => (
                    <div key={j} className={condition} />
                  ))}
                </div>
              ))}
            </div>
            <div className="chart-legend">
              {[47, 31, 15, 0].map((seconds) => (
                <span key={seconds}>
                  {formatClock(
                    new Date(now.getTime() - (seconds / 47) * mockData.hours * 3600000),
                    locale,
                  )}
                </span>
              ))}
            </div>
          </Card>
          {queue}
        </div>
        <Card title={t('Evidências da condição')}>
          <LineChart
            hours={mockData.hours}
            values={series}
            reference
            label={t('Evidências da condição')}
          />
        </Card>
      </div>
    );
  return (
    <div
      className="dashboard-page"
      data-screen={[
        'Visão geral',
        'Qualidade dos dados',
        'Referências',
        'Condição dos ativos',
        'Investigações',
      ].indexOf(page)}
      data-panel={panel}
    >
      {context}
      <div className="page-intro">
        <p>
          {t(filters.machine || 'Todas as máquinas')} · {t(filters.asset || 'Todos os ativos')}
        </p>
        <span>{t('Evidências, ocorrências de campo e validação de hipóteses')}</span>
      </div>
      <div className="stats five">
        <Stat label={t('Severidade')} value={t(mockData.analytics.investigation.severity)} />
        <Stat label={t('Duração')} value={`${fmt(mockData.analytics.investigation.duration)} h`} />
        <Stat label={t('Origem')} value={t(mockData.analytics.investigation.origin)} />
        <Stat
          label={t('Qualidade')}
          value={t(mockData.analytics.investigation.quality)}
          tone="good"
        />
        <Stat
          label={t('Status')}
          value={t(mockData.analytics.investigation.status)}
          tone="warning"
        />
      </div>
      <Card title={t('Linha do tempo integrada')}>
        <LineChart
          hours={mockData.hours}
          values={series}
          reference
          label={t('Linha do tempo integrada')}
        />
      </Card>
      <div className="split">
        <Card title={t('Evidências')}>
          <div className="timeline">
            {mockData.analytics.events.map(([a, b, time]) => (
              <div key={a}>
                <span className="timeline-icon">
                  <Activity size={16} />
                </span>
                <div>
                  <strong>{t(a)}</strong>
                  <p>{t(b)}</p>
                </div>
                <time>{time}</time>
              </div>
            ))}
          </div>
        </Card>
        <Card title={t('Registrar resultado')}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSaved(true);
            }}
          >
            <label className="form-label">
              {t('Observação de campo')}
              <textarea
                required
                maxLength={1000}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="form-label">
              {t('Resultado')}
              <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                {['Confirmar hipótese', 'Descartar hipótese'].map((s) => (
                  <option value={s} key={s}>
                    {t(s)}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary">
              <Check size={16} />
              {t('Registrar resultado')}
            </button>
            {saved && (
              <p role="status" className="good">
                {t('Resultado registrado nesta sessão.')}
              </p>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}

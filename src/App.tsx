import { lazy, Suspense, useState } from 'react';
import {
  LayoutDashboard,
  Activity,
  ChartNoAxesCombined,
  ShieldCheck,
  Search,
  ScanLine,
  FileCheck2,
  History,
  Box,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Factory,
  Layers,
  Clock,
  Globe,
} from 'lucide-react';
import { mockData, assetOptions, type Inspection } from './data';
import { useI18n } from './i18n';
import { LiveProvider, useLive, formatClock } from './live';
import { Boundary } from './ui';
import { Dashboards, type Filters } from './Dashboards';
import { CurrentInspection, ReferenceScreen, HistoryScreen } from './Inspection';
const Twin = lazy(() => import('./imported-twin/screens/DigitalTwin'));
export const nav = [
  'Visão geral',
  'Qualidade dos dados',
  'Referências',
  'Condição dos ativos',
  'Investigações',
  'Inspeção atual',
  'Referência de inspeção',
  'Histórico de Inspeção',
  'Digital Twin',
];
const icons = [
  LayoutDashboard,
  Activity,
  ChartNoAxesCombined,
  ShieldCheck,
  Search,
  ScanLine,
  FileCheck2,
  History,
  Box,
];
function AppShell() {
  const { t, lang, setLang } = useI18n();
  const [page, setPage] = useState('Visão geral');
  const [menu, setMenu] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    machine: '',
    asset: '',
    period: 'Últimas 8 horas',
  });
  const [inspection, setInspection] = useState<Inspection>(mockData.inspection.inspections[0]);
  const [history, setHistory] = useState(mockData.inspection.history);
  const [references, setReferences] = useState(mockData.references);
  const [active, setActive] = useState(12);
  const [, setReviews] = useState<Record<string, string>>({});
  const isInspection = [
    'Inspeção atual',
    'Referência de inspeção',
    'Histórico de Inspeção',
  ].includes(page);
  const navigate = (s: string) => {
    setFilters({ machine: '', asset: '', period: 'Últimas 8 horas' });
    setPage(s);
    setMenu(false);
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('Ir para o conteúdo')}
      </a>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label={t('Fechar menu')}
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={menu ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-symbol">
            <i />
            <i />
            <i />
          </div>
          <div>
            <strong>
              IPMAN<span> ANALYTICS</span>
            </strong>
            <small>{t('Monitoramento e inteligência operacional')}</small>
          </div>
        </div>
        <div className="workspace">
          <div className="workspace-icon">
            <Factory size={18} />
          </div>
          <div>
            <strong>Bosch</strong>
            <small>{t('Planta')} · Campinas</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav aria-label={t('Navegação principal')}>
          {nav.map((name, index) => {
            const Icon = icons[index];
            return (
              <div key={name}>
                {index === 5 && (
                  <div className="nav-section">
                    <span>{t('Inspeção Visual')}</span>
                    <span className="new-tag">VC</span>
                  </div>
                )}
                {index === 8 && <div className="nav-divider" />}
                <button
                  className={`nav-item ${page === name ? 'active' : ''}`}
                  aria-current={page === name ? 'page' : undefined}
                  onClick={() => navigate(name)}
                >
                  <Icon size={18} />
                  <span>{t(name)}</span>
                  {page === name && <ChevronRight size={14} />}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <small>IPMAN / {t('Fase 2')}</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label={t('Abrir menu')}
              onClick={() => setMenu((v) => !v)}
            >
              {menu ? <X /> : <Menu />}
            </button>
            <Factory size={15} />
            <span>{t('Planta')}</span>
            <ChevronRight size={13} />
            <strong>{t(page)}</strong>
          </div>
          <div className="top-actions">
            <LiveStatus />
            <label className="language">
              <Globe size={16} />
              <span className="sr-only">{t('Idioma')}</span>
              <select
                aria-label={t('Idioma')}
                value={lang}
                onChange={(e) => setLang(e.target.value as 'pt' | 'en')}
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
              </select>
            </label>
            <span className="avatar">MF</span>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className={
            isInspection
              ? 'inspection-main'
              : page === 'Digital Twin'
                ? 'operational-main twin-main'
                : 'operational-main'
          }
        >
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                IPMAN <span>/</span>{' '}
                {t(
                  page.includes('Inspeção') ||
                    page === 'Referência de inspeção' ||
                    page === 'Inspeção atual'
                    ? 'Inspeção Visual'
                    : 'Operação',
                )}
              </div>
              <h1>{t(page)}</h1>
            </div>
          </div>
          {![
            'Inspeção atual',
            'Referência de inspeção',
            'Histórico de Inspeção',
            'Digital Twin',
          ].includes(page) && (
            <div className="global-filters">
              <span>
                <Layers size={16} />
                {t('Filtros globais')}
              </span>
              <label>
                {t('Máquina')}
                <select
                  aria-label={t('Máquina')}
                  value={filters.machine}
                  onChange={(e) => setFilters({ ...filters, machine: e.target.value, asset: '' })}
                >
                  <option value="">{t('Todas as máquinas')}</option>
                  {mockData.plant.machines.map((v) => (
                    <option key={v} value={v}>
                      {v.replace('Rebarbadora', t('Rebarbação'))}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Ativo')}
                <select
                  aria-label={t('Ativo')}
                  value={filters.asset}
                  onChange={(e) => setFilters({ ...filters, asset: e.target.value })}
                >
                  <option value="">{t('Todos os ativos')}</option>
                  {assetOptions(filters.machine).map((name) => (
                    <option key={name} value={name}>
                      {t(name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Clock size={13} />
                {t('Período')}
                <select
                  aria-label={t('Período')}
                  value={filters.period}
                  onChange={(e) => setFilters({ ...filters, period: e.target.value })}
                >
                  {['Últimas 8 horas', 'Últimas 24 horas', 'Últimos 7 dias'].map((v) => (
                    <option value={v} key={v}>
                      {t(v)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className={isInspection ? undefined : 'live-content'}>
            <Boundary key={page}>
              {page === 'Digital Twin' ? (
                <Suspense fallback={<p role="status">{t('Carregando modelo 3D…')}</p>}>
                  <Twin />
                </Suspense>
              ) : page === 'Inspeção atual' ? (
                <CurrentInspection
                  inspection={inspection}
                  setInspection={setInspection}
                  activeVersion={active}
                />
              ) : page === 'Referência de inspeção' ? (
                <ReferenceScreen
                  references={references}
                  setReferences={setReferences}
                  active={active}
                  setActive={setActive}
                />
              ) : page === 'Histórico de Inspeção' ? (
                <HistoryScreen
                  history={history}
                  onReview={(i, note) => {
                    setHistory((h) => h.map((v) => (v.id === i.id ? i : v)));
                    setReviews((v) => ({ ...v, [i.id]: note }));
                  }}
                />
              ) : (
                <Dashboards
                  page={page}
                  filters={filters}
                  navigate={navigate}
                  setAsset={(asset) => setFilters((f) => ({ ...f, asset }))}
                />
              )}
            </Boundary>
          </div>
          <footer>
            <span>
              IPMAN <b>·</b> {t('Monitoramento e inteligência operacional')}
            </span>
            <span>v1.1</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function LiveStatus() {
  const { now } = useLive();
  const { t, locale } = useI18n();
  return (
    <span className="updated live-status">
      <i />
      {t('Online')}{' '}
      <time aria-label={t('Hora atual')} dateTime={now.toISOString()}>
        {formatClock(now, locale)}
      </time>
    </span>
  );
}
export default function App() {
  return (
    <LiveProvider>
      <AppShell />
    </LiveProvider>
  );
}

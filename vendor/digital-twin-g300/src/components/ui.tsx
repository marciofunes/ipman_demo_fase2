import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, useFormat } from '../i18n';
import { useApp } from '../data/store';

export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'navy' | 'muted';

export function Kpi({ label, value, unit, tone = 'navy', sub, testId }: { label: string; value: ReactNode; unit?: string; tone?: Tone; sub?: ReactNode; testId?: string }) {
  return (
    <div className="kpi" data-testid={testId}>
      <div className="kpi-label" title={label}>{label}</div>
      <div className={`kpi-value c-${tone}`}>
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Panel({ title, aside, children, className = '', style, bodyClass = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; style?: React.CSSProperties; bodyClass?: string }) {
  return (
    <section className={`panel ${className}`} style={style}>
      {title && (
        <h2>
          <span>{title}</span>
          {aside && <span className="aside">{aside}</span>}
        </h2>
      )}
      <div className={`panel-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export const statusTone = (s: 'normal' | 'attention' | 'critical'): Tone => (s === 'normal' ? 'green' : s === 'attention' ? 'orange' : 'red');

export function LangSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <div className="lang-switch" role="group" aria-label={t('app.language')}>
      {LANGUAGES.map((l) => (
        <button key={l.code} type="button" aria-pressed={i18n.language === l.code} title={l.name} onClick={() => i18n.changeLanguage(l.code)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

/** Hora atual (atualiza a cada segundo) + indicador Online */
export function LiveClock({ labelKey = 'app.lastUpdate' }: { labelKey?: string }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const nowS = useApp((s) => s.nowS);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return (
    <div className="live-clock">
      <span>
        {t(labelKey)} <time data-testid="clock" dateTime={new Date(nowS * 1000).toISOString()}>{fmt.time(nowS * 1000)}</time>
      </span>
      {online ? <span className="online">{t('app.online')}</span> : <span className="c-red">● {t('app.offline')}</span>}
    </div>
  );
}

export function PageHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="head-tools">
        <LangSwitch />
      </div>
    </header>
  );
}

export function CrumbBar({ items, clockLabelKey }: { items: ReactNode[]; clockLabelKey?: string }) {
  return (
    <nav className="crumb-bar" aria-label="breadcrumb">
      <ol className="crumbs">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ol>
      <LiveClock labelKey={clockLabelKey} />
    </nav>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // foca o primeiro campo só ao abrir e devolve o foco ao fechar
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('select, textarea, input, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header>{title}</header>
        <div className="modal-body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return undefined;
    const id = window.setTimeout(() => setMsg(null), 3500);
    return () => window.clearTimeout(id);
  }, [msg]);
  return [msg ? <div className="toast" role="status">{msg}</div> : null, setMsg];
}

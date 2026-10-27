import { Component, useState, useRef, useLayoutEffect, type ReactNode } from 'react';
import { useLive, formatClock } from './live';
import { useI18n } from './i18n';
export function Card({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function Stat({
  label,
  value,
  tone = '',
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}
export function Badge({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <span
      className={`badge ${['Reprovado', 'Divergente', 'Crítico'].includes(text) ? 'red' : ['Atenção', 'Revisão', 'Não detectado', 'Qualidade baixa'].includes(text) ? 'amber' : 'green'}`}
    >
      <i />
      {t(text)}
    </span>
  );
}
export function Photo({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  return (
    <div className="photo">
      {failed ? (
        <div role="alert">
          {t('Não foi possível carregar a imagem.')}
          <button onClick={() => setFailed(false)}>{t('Tentar novamente')}</button>
        </div>
      ) : (
        <img
          src="/reference/workpiece.jpeg"
          alt={t('Peça com gravação a laser')}
          onError={() => setFailed(true)}
        />
      )}{' '}
      {!failed && children}
    </div>
  );
}
export class Boundary extends Component<
  { children: ReactNode; model?: boolean },
  { error: boolean; key: number }
> {
  state = { error: false, key: 0 };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <ErrorView
        model={this.props.model}
        retry={() => this.setState((s) => ({ error: false, key: s.key + 1 }))}
      />
    ) : (
      <div className={this.props.model ? 'canvas-boundary' : undefined} key={this.state.key}>
        {this.props.children}
      </div>
    );
  }
}
function ErrorView({ model, retry }: { model?: boolean; retry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="error" role="alert">
      <strong>
        {t(
          model
            ? 'Modelo indisponível. Verifique o suporte WebGL e tente novamente.'
            : 'Ocorreu um erro ao exibir esta tela.',
        )}
      </strong>
      <button className="secondary" onClick={retry}>
        {t('Tentar novamente')}
      </button>
    </div>
  );
}
export function LineChart({
  values,
  reference = false,
  label,
  hours,
  unit = "RMS · mm/s²",
  scaleMax,
}: {
  values: number[];
  reference?: boolean;
  label: string;
  hours?: number;
  unit?: string;
  scaleMax?: number;
}) {
  const { t, locale } = useI18n(),
    { now } = useLive();
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 970, height: 200 });
  useLayoutEffect(() => {
    if (!svg.current || typeof ResizeObserver === 'undefined') return;
    const element = svg.current;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      if (box.width > 0 && box.height > 0) {
        const width = Math.round(box.width),
          height = Math.round(box.height);
        setSize((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height },
        );
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const width = Math.max(120, size.width),
    height = Math.max(70, size.height),
    left = 44,
    right = width - 12,
    top = 12,
    bottom = height - 27;
  const max = scaleMax ?? Math.max(5, Math.ceil(Math.max(...values)));
  const y = (value: number) => bottom - ((bottom - top) * value) / max;
  const points = values
    .map(
      (value, i) => `${left + (i * (right - left)) / Math.max(1, values.length - 1)},${y(value)}`,
    )
    .join(' ');
  return (
    <div className="chart">
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {Array.from({ length: 5 }, (_, i) => ((i + 1) * max) / 5).map((value) => (
          <g key={value}>
            <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#e4ecf0" />
            <text x="3" y={y(value) + 4}>
              {value.toLocaleString(locale, { maximumFractionDigits: 1 })}
            </text>
          </g>
        ))}
        {reference && (
          <>
            <rect
              x={left}
              y={y(2.8)}
              width={right - left}
              height={y(1.8) - y(2.8)}
              fill="#dceee9"
            />
            <line
              x1={left}
              x2={right}
              y1={y(2.3)}
              y2={y(2.3)}
              stroke="#36a387"
              strokeDasharray="6 4"
            />
          </>
        )}
        <polygon
          points={`${left},${bottom} ${points} ${right},${bottom}`}
          fill="#e7f2fa"
          fillOpacity=".7"
        />
        <polyline points={points} fill="none" stroke="#0786c7" strokeWidth="2.5" />
        {[47, 31, 15, 0].map((seconds, i) => (
          <text
            key={seconds}
            x={left + (i * (right - left)) / 3}
            y={height - 7}
            textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
          >
            {hours && hours > 24
              ? new Date(now.getTime() - (seconds / 47) * hours * 3600000).toLocaleDateString(
                  locale,
                  { day: '2-digit', month: '2-digit' },
                )
              : formatClock(
                  new Date(
                    now.getTime() - (hours ? (seconds / 47) * hours * 3600000 : seconds * 1000),
                  ),
                  locale,
                )}
          </text>
        ))}
      </svg>
      <div className="chart-legend">
        <span>
          <i className="blue-dot" />
          {t('Atual')}
        </span>
        {reference && (
          <span>
            <i className="green-dot" />
            {t('Referência')}
          </span>
        )}
        <span>{unit}</span>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { useFormat } from '../../i18n';
type SeriesPoint = { t: number; v: number };

export interface LineSeries {
  id: string;
  points: SeriesPoint[] | { t: number; v: number }[];
  color: string;
  width?: number;
  dashed?: boolean;
  fill?: boolean;
}

interface Props {
  series: LineSeries[];
  /** domínio fixo do eixo Y; se omitido é calculado pelos dados */
  domain?: [number, number];
  envelope?: { low: number; high: number } | null;
  /** índices [início, fim] destacados no primeiro série */
  highlight?: [number, number] | null;
  thresholds?: { v: number; color: string }[];
  showAxis?: boolean;
  showY?: boolean;
  yDigits?: number;
  ariaLabel: string;
  /** desenha um ponto pulsante no último valor */
  liveDot?: boolean;
}

const W = 1000;
const H = 300;

export default function LineChart({
  series,
  domain,
  envelope,
  highlight,
  thresholds = [],
  showAxis = true,
  showY = false,
  yDigits = 1,
  ariaLabel,
  liveDot = true,
}: Props) {
  const fmt = useFormat();
  const all = series.flatMap((s) => s.points);
  const t0 = all.length ? Math.min(...series.map((s) => s.points[0]?.t ?? Infinity)) : 0;
  const t1 = all.length
    ? Math.max(...series.map((s) => s.points[s.points.length - 1]?.t ?? -Infinity))
    : 1;

  const [lo, hi] = useMemo(() => {
    if (domain) return domain;
    const vals = all.map((p) => p.v);
    if (envelope) vals.push(envelope.low, envelope.high);
    thresholds.forEach((th) => vals.push(th.v));
    let a = Math.min(...vals);
    let b = Math.max(...vals);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return [0, 1];
    if (a === b) {
      a -= 1;
      b += 1;
    }
    const pad = (b - a) * 0.12;
    return [a - pad, b + pad];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, all, envelope, thresholds]);

  const x = (t: number) => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * W);
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;

  const paths = series.map((s) => {
    const d = s.points
      .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join('');
    return { s, d };
  });

  const first = series[0]?.points ?? [];
  const hl =
    highlight && first.length
      ? [x(first[highlight[0]].t), x(first[Math.min(highlight[1], first.length - 1)].t)]
      : null;
  const last = first[first.length - 1];

  const mid = t0 + (t1 - t0) / 2;
  const span = t1 - t0;
  const label = (t: number) =>
    span > 2 * 86400000 ? fmt.date(t) : span > 3600000 * 3 ? fmt.shortTime(t) : fmt.time(t);

  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      <div className="chart-plot" style={showY ? { marginLeft: '2.2rem' } : undefined}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {envelope && (
            <g>
              <rect
                x={0}
                width={W}
                y={y(envelope.high)}
                height={Math.max(0, y(envelope.low) - y(envelope.high))}
                fill="#dcebf6"
                opacity={0.85}
              />
              <line
                x1={0}
                x2={W}
                y1={y(envelope.high)}
                y2={y(envelope.high)}
                stroke="#7fb3d8"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={0}
                x2={W}
                y1={y(envelope.low)}
                y2={y(envelope.low)}
                stroke="#7fb3d8"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
          {thresholds.map((th) => (
            <line
              key={th.v}
              x1={0}
              x2={W}
              y1={y(th.v)}
              y2={y(th.v)}
              stroke={th.color}
              strokeWidth={1}
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {hl && (
            <rect
              x={hl[0]}
              width={Math.max(8, hl[1] - hl[0])}
              y={6}
              height={H - 12}
              fill="#fbe3cc"
              stroke="#e07b10"
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
              opacity={0.9}
            />
          )}
          {paths.map(({ s, d }) => (
            <g key={s.id}>
              {s.fill && <path d={`${d}L${W},${H}L0,${H}Z`} fill={s.color} opacity={0.08} />}
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width ?? 2.2}
                strokeDasharray={s.dashed ? '6 4' : undefined}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ))}
        </svg>
        {liveDot && last && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: `calc(${(x(last.t) / W) * 100}% - 0.3rem)`,
              top: `calc(${(y(last.v) / H) * 100}% - 0.3rem)`,
              width: '0.6rem',
              height: '0.6rem',
              borderRadius: '50%',
              background: series[0].color,
              boxShadow: `0 0 0 0.25rem ${series[0].color}33`,
              transition: 'top 0.6s ease',
            }}
          />
        )}
        {showY && (
          <div
            className="chart-yaxis"
            style={{ left: '-2.2rem', width: '2rem', textAlign: 'right' }}
          >
            <span>{hi.toFixed(yDigits)}</span>
            <span>{((hi + lo) / 2).toFixed(yDigits)}</span>
            <span>{lo.toFixed(yDigits)}</span>
          </div>
        )}
      </div>
      {showAxis && first.length > 1 && (
        <div className="chart-axis" style={showY ? { marginLeft: '2.2rem' } : undefined}>
          <span>{label(t0)}</span>
          <span>{label(mid)}</span>
          <span>{label(t1)}</span>
        </div>
      )}
    </div>
  );
}

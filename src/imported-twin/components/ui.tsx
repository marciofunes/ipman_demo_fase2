import type { ReactNode } from 'react';
export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'navy' | 'muted';
export function Kpi({
  label,
  value,
  unit,
  tone = 'navy',
  sub,
  testId,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: Tone;
  sub?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="kpi" data-testid={testId}>
      <div className="kpi-label" title={label}>
        {label}
      </div>
      <div className={`kpi-value c-${tone}`}>
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
export const statusTone = (s: 'normal' | 'attention' | 'critical'): Tone =>
  s === 'normal' ? 'green' : s === 'attention' ? 'orange' : 'red';
export function PageHead({ subtitle }: { title: string; subtitle: string }) {
  return <p className="twin-subtitle">{subtitle}</p>;
}
export function CrumbBar({ items }: { items: ReactNode[] }) {
  return (
    <div className="twin-breadcrumb">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && ' / '}
          {item}
        </span>
      ))}
    </div>
  );
}

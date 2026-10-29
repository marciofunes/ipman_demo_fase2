import { useState } from 'react';
import { useI18n } from './i18n';
import { Card, LineChart } from './ui';
import { queryElectrical, type ElectricalMetric } from './electrical';

const quantities: { key: ElectricalMetric; label: string; unit: string; decimals: number }[] = [
  { key: 'voltage', label: 'Tensão entre fases', unit: 'V', decimals: 1 },
  { key: 'current', label: 'Corrente RMS', unit: 'A', decimals: 2 },
  { key: 'power', label: 'Potência ativa', unit: 'kW', decimals: 2 },
  { key: 'reactive', label: 'Potência reativa', unit: 'kvar', decimals: 2 },
  { key: 'apparent', label: 'Potência aparente', unit: 'kVA', decimals: 2 },
  { key: 'pf', label: 'Fator de potência', unit: '', decimals: 3 },
  { key: 'frequency', label: 'Frequência elétrica', unit: 'Hz', decimals: 2 },
];

export function ElectricalPanel({ data, hours }: { data: ReturnType<typeof queryElectrical>; hours: number }) {
  const { t, locale } = useI18n();
  const [metric, setMetric] = useState<ElectricalMetric>('power');
  const selected = quantities.find(q => q.key === metric)!;
  return (
    <Card title={t('Monitoramento Trifásico')} className="electrical-panel">
      <p className="muted">{t('atualização em tempo real')}</p>
      <div className="electrical-metrics" role="group" aria-label={t('Grandeza no gráfico')}>
        {quantities.map(q => (
          <button key={q.key} type="button" data-testid={`electrical-${q.key}`}
            aria-pressed={metric === q.key} onClick={() => setMetric(q.key)}>
            <span>{t(q.label)}</span>
            <strong>{data.totals[q.key].toLocaleString(locale, {
              minimumFractionDigits: q.decimals, maximumFractionDigits: q.decimals,
            })} <small>{q.unit}</small></strong>
          </button>
        ))}
      </div>
      <p className="electrical-scope">{t('Tensão, corrente e frequência: médias dos ativos selecionados. P e Q: somas. S e FP: resultantes de P e Q.')}</p>
      <h3>{t('Tendência elétrica')} · {t(selected.label)}</h3>
      <LineChart values={data.history.map(row => row[metric])} hours={hours}
        label={`${t('Tendência elétrica')} · ${t(selected.label)}`}
        unit={`${t(selected.label)}${selected.unit ? ` · ${selected.unit}` : ''}`}
        scaleMax={metric === 'pf' ? 1 : undefined} />
    </Card>
  );
}

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../i18n';
import { useTwin } from '../twin/store';
import type { ComponentId } from '../twin/whatif';
import { LABEL_IDS, layoutLabels, projected, viewport, type LabelId } from './labels';

/**
 * Rótulos ao vivo do Digital Twin (nome do componente + valores medidos a cada segundo).
 * Ficam numa camada HTML sobre o canvas, ligados ao ponto 3D por uma linha-guia.
 */
export default function LabelsOverlay() {
  const { t } = useTranslation();
  const fmt = useFormat();
  const show = useTwin((s) => s.labels);
  const live = useTwin((s) => s.live);
  const elec = useTwin((s) => s.electrical);
  const selected = useTwin((s) => s.selected);
  const select = useTwin((s) => s.select);
  const refs = useRef<Record<string, HTMLButtonElement | HTMLDivElement | null>>({});
  const lines = useRef<Record<string, SVGLineElement | null>>({});
  const dots = useRef<Record<string, SVGCircleElement | null>>({});

  useEffect(() => {
    if (!show) return undefined;
    let raf = 0;
    const loop = () => {
      const boxes = LABEL_IDS.flatMap((id) => {
        const p = projected[id];
        const el = refs.current[id];
        if (!p || !el || !p.visible || p.occluded) {
          if (el) el.style.visibility = 'hidden';
          lines.current[id]?.setAttribute('visibility', 'hidden');
          dots.current[id]?.setAttribute('visibility', 'hidden');
          return [];
        }
        return [{ id, ax: p.x, ay: p.y, w: el.offsetWidth, h: el.offsetHeight }];
      });
      const placed = layoutLabels(boxes, viewport.width, viewport.height);
      for (const pl of placed) {
        const el = refs.current[pl.id];
        if (el) {
          el.style.visibility = 'visible';
          el.style.transform = `translate(${Math.round(pl.x)}px, ${Math.round(pl.y)}px)`;
        }
        const ln = lines.current[pl.id];
        if (ln) {
          ln.setAttribute('visibility', 'visible');
          ln.setAttribute('x1', String(pl.ax));
          ln.setAttribute('y1', String(pl.ay));
          ln.setAttribute('x2', String(pl.side === 'left' ? pl.x + pl.w : pl.x));
          ln.setAttribute('y2', String(pl.y + pl.h / 2));
        }
        const d = dots.current[pl.id];
        if (d) {
          d.setAttribute('visibility', 'visible');
          d.setAttribute('cx', String(pl.ax));
          d.setAttribute('cy', String(pl.ay));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [show]);

  if (!show) return null;

  const statusColor = { normal: '#1e8a55', attention: '#e07b10', critical: '#c9413b' } as const;

  return (
    <div className="labels-layer" aria-live="off">
      <svg className="labels-lines" width="100%" height="100%">
        {LABEL_IDS.map((id) => {
          const color = id === 'electrical' ? '#6b4aa8' : statusColor[live[id as ComponentId].status];
          return (
            <g key={id}>
              <line ref={(el) => (lines.current[id] = el)} stroke={color} strokeWidth={1.4} visibility="hidden" />
              <circle ref={(el) => (dots.current[id] = el)} r={4} fill={color} stroke="#fff" strokeWidth={1.5} visibility="hidden" />
            </g>
          );
        })}
      </svg>
      {LABEL_IDS.map((id: LabelId) => {
        if (id === 'electrical') {
          return (
            <div key={id} ref={(el) => (refs.current[id] = el)} className="twin-label electrical" style={{ visibility: 'hidden' }} data-testid="label-electrical">
              <span className="tl-name">
                <i className="dot sm" style={{ background: '#6b4aa8' }} />
                {t('twin.electricalLabel')}
              </span>
              <span className="tl-main">
                {fmt.int(elec.voltage)} V · <b>{fmt.num(elec.current, 1)}</b> A · FP <b>{fmt.num(elec.pf, 2)}</b>
              </span>
              <span className="tl-sub">
                P {fmt.num(elec.power, 1)} kW · Q {fmt.num(elec.reactive, 1)} kvar · S {fmt.num(elec.apparent, 1)} kVA
              </span>
            </div>
          );
        }
        const r = live[id];
        const rpm = id === 'table' ? `${fmt.num(r.shaftRpm, 1)} rpm` : `${fmt.int(r.shaftRpm)} rpm`;
        return (
          <button
            key={id}
            type="button"
            ref={(el) => (refs.current[id] = el)}
            className={`twin-label ${r.status}${selected === id ? ' selected' : ''}`}
            style={{ visibility: 'hidden' }}
            onClick={() => select(id)}
            data-testid={`label-${id}`}
          >
            <span className="tl-name">
              <i className={`dot sm ${r.status}`} />
              {t(`twin.componentsShort.${id}`)}
              <em>{t(`status.${r.status}`)}</em>
            </span>
            <span className="tl-main">
              RMS <b>{fmt.num(r.rms, 2)}</b> mm/s · K <b>{fmt.num(r.kurtosis, 1)}</b>
            </span>
            <span className="tl-sub">
              {fmt.num(r.current, 1)} A · {fmt.num(r.power, 1)} kW · {rpm}
            </span>
          </button>
        );
      })}
    </div>
  );
}

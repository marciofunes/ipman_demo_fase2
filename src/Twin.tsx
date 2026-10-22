import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RotateCcw, Pause, Play, Scan, Tags, Activity, Box, SlidersHorizontal } from 'lucide-react';
import { createG300Model, setShellTransparency } from './g300.model';
import {
  componentDefinitions,
  componentIds,
  conditionColor,
  conditionName,
  defaultTwinScenario,
  evaluateTwin,
  type ComponentId,
  type TwinReadings,
} from './twin-engine';
import { useLive } from './live';
import { useI18n } from './i18n';
import { Boundary, Card, Stat } from './ui';

type AnnotationRefs = React.MutableRefObject<
  Partial<Record<ComponentId, HTMLButtonElement | null>>
>;
function ViewControls({ resetToken }: { resetToken: number }) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    if (size.width < 1 || size.height < 1) return;
    const aspect = size.width / Math.max(1, size.height);
    const distance = Math.max(11.2, 7.8 / (2 * Math.tan((19 * Math.PI) / 180) * aspect));
    const direction = new THREE.Vector3(6.3, 2.55, 8.7).normalize().multiplyScalar(distance);
    camera.position.copy(direction.add(new THREE.Vector3(0.1, 2.35, 0.1)));
    controls.current?.target.set(0.1, 2.35, 0.1);
    controls.current?.update();
    invalidate();
  }, [camera, size.width, size.height, resetToken, invalidate]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0.1, 2.35, 0.1]}
      minDistance={5.5}
      maxDistance={32}
      maxPolarAngle={Math.PI / 2 - 0.04}
    />
  );
}

function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.06);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.65;
    return () => {
      scene.environment = null;
      target.dispose();
      room.dispose();
      generator.dispose();
    };
  }, [gl, scene]);
  return null;
}
function Machine({
  readings,
  running,
  xray,
  selected,
  labels,
  onSelect,
  annotations,
}: {
  readings: TwinReadings;
  running: boolean;
  xray: boolean;
  selected: ComponentId;
  labels: boolean;
  onSelect: (id: ComponentId) => void;
  annotations: AnnotationRefs;
}) {
  const model = useMemo(createG300Model, []),
    elapsed = useRef(0);
  const { t, locale } = useI18n();
  const color = useMemo(() => new THREE.Color(), []);
  const { camera, size } = useThree();
  const projected = useMemo(() => new THREE.Vector3(), []);
  const endpoint = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => model.dispose(), [model]);
  useEffect(() => {
    setShellTransparency(model, xray);
  }, [xray, model]);
  useFrame((_, delta) => {
    if (size.width < 1 || size.height < 1) return;
    const dt = Math.min(delta, 0.05);
    if (running) elapsed.current += dt;
    const time = elapsed.current;
    componentIds.forEach((id, index) => {
      const p = model.parts[id],
        value = readings[id];
      const label = annotations.current[id],
        leader = model.leaders[id];
      leader.visible = labels;
      if (label) {
        projected.set(...p.anchor).project(camera);
        let x = (projected.x * 0.5 + 0.5) * size.width,
          y = (-projected.y * 0.5 + 0.5) * size.height;
        const w = label.offsetWidth,
          h = label.offsetHeight;
        if (size.width < 600) {
          const left = id === 'motor' || id === 'spindle' || id === 'table';
          const row =
            id === 'motor' || id === 'pump3' ? 0 : id === 'spindle' || id === 'pump2' ? 1 : 2;
          x = left ? w / 2 + 10 : size.width - w / 2 - 10;
          y = size.height * (0.25 + row * 0.27);
        }
        if (size.height < 260) {
          x = (size.width * ((index % 3) + 0.5)) / 3;
          y = Math.floor(index / 3) === 0 ? 58 : size.height - 25;
        }
        x = THREE.MathUtils.clamp(x, w / 2 + 10, size.width - w / 2 - 10);
        y = THREE.MathUtils.clamp(
          y,
          h / 2 + (size.height < 260 ? 38 : 60),
          size.height - h / 2 - 10,
        );
        label.style.transform = `translate3d(${x - w / 2}px,${y - h / 2}px,0)`;
        label.style.visibility = 'visible';
        endpoint
          .set((x / size.width) * 2 - 1, 1 - (y / size.height) * 2, projected.z)
          .unproject(camera);
        const attribute = leader.geometry.getAttribute('position') as THREE.BufferAttribute;
        attribute.setXYZ(0, p.group.position.x, p.group.position.y, p.group.position.z);
        attribute.setXYZ(1, endpoint.x, endpoint.y, endpoint.z);
        attribute.needsUpdate = true;
        leader.geometry.computeBoundingSphere();
        leader.material.color.set(conditionColor(value.rms));
      }

      const amplitude = Math.min(0.095, Math.max(0, value.rms - 1.5) * 0.008);
      p.group.position.copy(p.rest);
      p.group.position.x += Math.sin(time * 43 + index) * amplitude;
      p.group.position.y += Math.sin(time * 57 + index * 2) * amplitude * 0.55;
      p.group.rotation.z = Math.sin(time * 31 + index) * amplitude * 0.14;
      if (running) {
        const speed = id === 'table' ? (value.rpm * Math.PI) / 30 : value.rpm / 240;
        if (id === 'spindle' || id === 'motor') p.rotor.rotation.z += dt * speed;
        else p.rotor.rotation.y += dt * speed;
      }
      if (id === 'spindle')
        p.group.position.z += Math.sin(time * 0.8) * (0.03 + value.load * 0.0012);
      color.set(conditionColor(value.rms));
      p.materials.forEach((material, i) => {
        if (running) material.color.lerp(color, 0.12);
        else material.color.copy(color);
        material.emissive.copy(color);
        material.emissiveIntensity = value.rms >= 5 ? 0.14 : id === selected ? 0.055 : 0.015;
        material.roughness = i ? 0.3 : 0.4;
      });
    });
    if (running)
      model.coolant.children.forEach((chip, i) => {
        chip.position.y = 1.55 + (((time * readings.spindle.load) / 45 + i * 0.12) % 0.4);
        chip.visible = readings.spindle.load > 30;
      });
  });
  function pick(event: ThreeEvent<MouseEvent>) {
    const id = event.object.userData.componentId as ComponentId | undefined;
    if (id) {
      event.stopPropagation();
      onSelect(id);
    }
  }
  return <primitive object={model.root} onClick={pick} />;
}

export default function Twin() {
  const { t, locale } = useI18n(),
    { tick } = useLive();
  const [scenario, setScenario] = useState(defaultTwinScenario);
  const [compact, setCompact] = useState(
    () => window.matchMedia('(max-width:760px), (max-height:640px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width:760px), (max-height:640px)');
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const annotations = useRef<Partial<Record<ComponentId, HTMLButtonElement | null>>>({});
  const [running, setRunning] = useState(true),
    [pausedTick, setPausedTick] = useState(0);
  const [xray, setXray] = useState(false),
    [labels, setLabels] = useState(true),
    [view, setView] = useState(0);
  const [parameter, setParameter] = useState('rpm');
  const [selected, setSelected] = useState<ComponentId>('spindle'),
    [pane, setPane] = useState('equipment');
  const readings = useMemo(
    () => evaluateTwin(scenario, running ? tick : pausedTick),
    [scenario, running, tick, pausedTick],
  );
  const active = readings[selected],
    definition = componentDefinitions.find((c) => c.id === selected)!;
  const [histories, setHistories] = useState(
    () =>
      Object.fromEntries(
        componentIds.map((id) => [id, Array(24).fill(readings[id].rms)]),
      ) as Record<ComponentId, number[]>,
  );
  useEffect(() => {
    if (running)
      setHistories(
        (previous) =>
          Object.fromEntries(
            componentIds.map((id) => [id, [...previous[id].slice(-23), readings[id].rms]]),
          ) as Record<ComponentId, number[]>,
      );
  }, [tick, running]);
  const history = histories[selected];
  const fmt = (n: number, decimals = 1) =>
    n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const tint = conditionColor(active.rms),
    pump = selected.startsWith('pump');
  const controls = [
    {
      key: 'rpm' as const,
      label: selected === 'table' ? 'Rotação da mesa' : 'Rotação',
      min: definition.range[0],
      max: definition.range[1],
      step: selected === 'table' ? 1 : 50,
      unit: 'rpm',
    },
    { key: 'load' as const, label: 'Carga de processo', min: 20, max: 100, step: 1, unit: '%' },
    {
      key: pump ? ('restriction' as const) : ('imbalance' as const),
      label: pump ? 'Restrição hidráulica' : 'Desbalanceamento',
      min: 0,
      max: pump ? 90 : 100,
      step: 1,
      unit: '%',
    },
  ];
  const points = history.map((v, i) => `${(i * 240) / 23},${52 - Math.min(12, v) * 3.8}`).join(' ');
  return (
    <div className="twin-dashboard" data-pane={pane}>
      <div className="twin-summary">
        <span>
          <i />
          {t('Monitoramento por componente')} <b>GROB G300</b>
        </span>
        <span>
          {t(definition.name)} · {t('Atualização a cada segundo')}
        </span>
      </div>
      <div className="stats five twin-metrics">
        <Stat
          label={t('RMS de vibração')}
          value={
            <span data-testid="twin-rms">
              {fmt(active.rms, 2)} <small>mm/s</small>
            </span>
          }
          tone={active.rms >= 5 ? 'danger' : active.rms >= 3 ? 'warning' : 'good'}
        />
        <Stat label={t('Corrente')} value={`${fmt(active.current)} A`} />
        <Stat label={t('Potência')} value={`${fmt(active.power)} kW`} />
        <Stat label={t('FP')} value={fmt(active.pf, 2)} />
        <Stat
          label={t('Anomaly Score')}
          value={`${fmt(active.score, 0)} / 100`}
          tone={active.score > 50 ? 'danger' : 'good'}
        />
      </div>
      <div className="twin-mobile-tabs">
        <button
          className={pane === 'equipment' ? 'selected' : ''}
          onClick={() => setPane('equipment')}
        >
          <Box size={14} />
          {t('Equipamento')}
        </button>
        <button
          className={pane === 'scenario' ? 'selected' : ''}
          onClick={() => setPane('scenario')}
        >
          <SlidersHorizontal size={14} />
          {t('Cenário what-if')}
        </button>
      </div>
      <div className="twin-workspace">
        <Card className="twin-scene">
          <div className="scene-toolbar">
            <span className="live-pill">
              <i />
              {t(running ? 'Processo em execução' : 'Processo pausado')}
            </span>
            <div>
              <button
                className={xray ? 'active' : ''}
                aria-pressed={xray}
                onClick={() => setXray((v) => !v)}
              >
                <Scan size={15} />
                {t('Raio-X')}
              </button>
              <button
                className={labels ? 'active' : ''}
                aria-label={t('Labels dos componentes')}
                aria-pressed={labels}
                onClick={() => setLabels((v) => !v)}
              >
                <Tags size={15} />
              </button>
              <button aria-label={t('Vista inicial')} onClick={() => setView((v) => v + 1)}>
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
          <div className="scene-canvas">
            <Boundary model>
              <Suspense fallback={<div role="status">{t('Carregando modelo 3D…')}</div>}>
                <Canvas
                  frameloop={running && (!compact || pane === 'equipment') ? 'always' : 'demand'}
                  shadows
                  camera={{ position: [6.4, 4.9, 8.8], fov: 38 }}
                  dpr={[1, 1.5]}
                  gl={{ antialias: true }}
                  fallback={
                    <div role="alert">
                      {t('Modelo indisponível. Verifique o suporte WebGL e tente novamente.')}
                    </div>
                  }
                >
                  <color attach="background" args={['#edf3f6']} />
                  <Studio />
                  <ambientLight intensity={0.65} />
                  <hemisphereLight args={['#e8f5ff', '#788b99', 1.2]} />
                  <directionalLight
                    position={[3, 9, 7]}
                    intensity={2.7}
                    castShadow
                    shadow-mapSize={[1024, 1024]}
                    shadow-camera-left={-7}
                    shadow-camera-right={7}
                    shadow-camera-top={7}
                    shadow-camera-bottom={-7}
                  />
                  <directionalLight position={[-5, 4, -3]} intensity={1.5} />
                  <Machine
                    readings={readings}
                    running={running}
                    xray={xray}
                    selected={selected}
                    labels={labels}
                    onSelect={setSelected}
                    annotations={annotations}
                  />
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]} receiveShadow>
                    <planeGeometry args={[40, 40]} />
                    <shadowMaterial transparent opacity={0.18} />
                  </mesh>
                  <Grid
                    position={[0, -0.025, 0]}
                    args={[22, 22]}
                    cellSize={0.5}
                    cellThickness={0.4}
                    cellColor="#d3e0e8"
                    sectionColor="#c4d6e1"
                    fadeDistance={20}
                    infiniteGrid
                  />
                  <ViewControls resetToken={view} />
                </Canvas>
              </Suspense>
            </Boundary>
            {labels && (
              <div className="annotation-layer">
                {componentDefinitions.map((def) => {
                  const r = readings[def.id];
                  return (
                    <button
                      key={def.id}
                      ref={(element) => {
                        annotations.current[def.id] = element;
                      }}
                      className={`machine-label ${selected === def.id ? 'chosen' : ''}`}
                      style={{ '--condition': conditionColor(r.rms) } as React.CSSProperties}
                      onClick={() => setSelected(def.id)}
                      aria-label={`${t('Selecionar componente')} ${t(def.name)}`}
                    >
                      <span>
                        <i />
                        {t(def.name)}
                      </span>
                      <strong>
                        {fmt(r.rms, 2)}
                        <small> mm/s</small>
                      </strong>
                      <em>
                        {fmt(r.current)} A · {t(r.condition)}
                      </em>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="scene-bottom">
            <div className="condition-legend">
              {['Normal', 'Atenção', 'Crítico'].map((name, i) => (
                <span key={name}>
                  <i style={{ background: ['#25ad91', '#eea321', '#eb5147'][i] }} />
                  {t(name)}
                </span>
              ))}
            </div>
            <span>{t('Arraste para girar • role para aproximar')}</span>
          </div>
        </Card>
        <Card className="twin-controls">
          <div className="control-heading">
            <SlidersHorizontal size={17} />
            <h2>{t('Cenário what-if')}</h2>
          </div>
          <label className="component-select">
            {t('Componente')}
            <select
              aria-label={t('Componente')}
              value={selected}
              onChange={(e) => setSelected(e.target.value as ComponentId)}
            >
              {componentDefinitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {t(c.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="parameter-select">
            {t('Parâmetro')}
            <select
              aria-label={t('Parâmetro')}
              value={controls.some((c) => c.key === parameter) ? parameter : 'rpm'}
              onChange={(e) => setParameter(e.target.value)}
            >
              {controls.map((c) => (
                <option key={c.key} value={c.key}>
                  {t(c.label)}
                </option>
              ))}
            </select>
          </label>
          <div className="component-buttons">
            {componentDefinitions.map((c) => (
              <button
                key={c.id}
                className={selected === c.id ? 'active' : ''}
                aria-label={`${t('Selecionar componente')} ${t(c.name)}`}
                onClick={() => setSelected(c.id)}
              >
                <i style={{ background: conditionColor(readings[c.id].rms) }} />
                {t(c.name)}
              </button>
            ))}
          </div>
          <div
            className="component-parameters"
            data-parameter={controls.some((c) => c.key === parameter) ? parameter : 'rpm'}
          >
            {controls.map((c) => (
              <label className="slider" data-parameter={c.key} key={`${selected}-${c.key}`}>
                <span>
                  {t(c.label)}
                  <strong>
                    {fmt(scenario[selected][c.key], 0)} {c.unit}
                  </strong>
                </span>
                <input
                  type="range"
                  aria-label={t(c.label)}
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={scenario[selected][c.key]}
                  onChange={(e) =>
                    setScenario((previous) => ({
                      ...previous,
                      [selected]: { ...previous[selected], [c.key]: Number(e.target.value) },
                    }))
                  }
                />
                <small>
                  {c.min} — {c.max} {c.unit}
                </small>
              </label>
            ))}
          </div>
          <div
            className="component-condition"
            style={{ '--condition': tint } as React.CSSProperties}
          >
            <div>
              <Activity size={16} />
              <strong>{t(conditionName(active.rms))}</strong>
              <span>{fmt(active.rms, 2)} mm/s</span>
            </div>
            <p>
              {t(
                active.rms >= 5
                  ? 'Vibração elevada com propagação para os conjuntos acoplados.'
                  : active.rms >= 3
                    ? 'Desvio de vibração. Observe o componente destacado.'
                    : 'Operação estável dentro do envelope de referência.',
              )}
            </p>
            <svg
              viewBox="0 0 240 55"
              role="img"
              aria-label={t('Tendência de vibração do componente')}
            >
              <line x1="0" x2="240" y1="40.6" y2="40.6" stroke="#b7cbd3" strokeDasharray="3 3" />
              <polyline points={points} fill="none" stroke={tint} strokeWidth="2" />
            </svg>
          </div>
          <div className="twin-actions">
            <button
              className="primary"
              onClick={() => {
                setPausedTick(tick);
                setRunning((v) => !v);
              }}
            >
              {running ? <Pause size={15} /> : <Play size={15} />}{' '}
              {t(running ? 'Pausar processo' : 'Iniciar processo')}
            </button>
            <button
              className="secondary"
              aria-label={t('Restaurar cenário')}
              title={t('Restaurar cenário')}
              onClick={() => setScenario(defaultTwinScenario())}
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

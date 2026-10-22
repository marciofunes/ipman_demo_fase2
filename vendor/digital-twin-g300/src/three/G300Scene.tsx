import { ContactShadows, Environment, Lightformer, OrbitControls, useProgress } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ErrorBoundary, ScreenError } from '../components/ErrorBoundary';
import { useTwin, type CameraPreset } from '../twin/store';
import { applyXray, createPartMaterials, createShellMaterials } from './materials';
import Housing from './parts/Housing';
import MachiningCell from './parts/Machining';
import ServiceUnits from './parts/Pumps';
import { HmiScreen } from './textures';
import { projectAnchors, updateOcclusion } from './labels';
import LabelsOverlay from './LabelsOverlay';

const CAMERAS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [3.95, 3.05, 6.25], target: [0.15, 1.1, 0.0] },
  workarea: { pos: [-0.42, 1.7, 2.55], target: [0.15, 1.12, 0.85] },
  service: { pos: [3.7, 1.75, -0.6], target: [0.85, 1.05, -1.0] },
  xray: { pos: [-4.4, 3.4, 4.6], target: [0.25, 1.1, -0.1] },
};

function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl> }) {
  const { camera } = useThree();
  const preset = useTwin((s) => s.camera);
  const nonce = useTwin((s) => s.cameraNonce);
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; t: number } | null>(null);
  useEffect(() => {
    const c = CAMERAS[preset];
    goal.current = { pos: new THREE.Vector3(...c.pos), target: new THREE.Vector3(...c.target), t: 0 };
  }, [preset, nonce]);
  useFrame((_, dt) => {
    const g = goal.current;
    const ctl = controls.current;
    if (!g || !ctl) return;
    g.t += dt;
    const k = 1 - Math.exp(-dt * 4);
    camera.position.lerp(g.pos, k);
    ctl.target.lerp(g.target, k);
    ctl.update();
    if (g.t > 2.2) goal.current = null;
  });
  return null;
}

/**
 * Evidência de revisão img2threejs: com ?review=unlit a cena é desenhada sem luz e sem mapas
 * (silhueta pura), usada na verificação do passe de blockout.
 */
function UnlitReview() {
  const { scene } = useThree();
  useFrame(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material as THREE.Material).userData.unlit) {
        const mat = new THREE.MeshBasicMaterial({ color: '#9aa3ab' });
        mat.userData.unlit = true;
        m.material = mat;
      }
    });
  });
  return null;
}

function Projector() {
  const last = useRef(-1);
  useFrame(({ camera, size, scene, clock }) => {
    projectAnchors(camera, size.width, size.height);
    if (clock.elapsedTime - last.current > 0.2) {
      last.current = clock.elapsedTime;
      updateOcclusion(camera, scene);
    }
  });
  return null;
}

function Hmi() {
  const screen = useMemo(() => new HmiScreen(), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: screen.texture, emissive: '#ffffff', emissiveMap: screen.texture, emissiveIntensity: 0.55, roughness: 0.25 }), [screen]);
  const last = useRef(-1);
  useFrame(({ clock }) => {
    const s = Math.floor(clock.elapsedTime);
    if (s === last.current) return;
    last.current = s;
    const st = useTwin.getState();
    screen.draw({ rpm: st.live.spindle.shaftRpm, feed: st.params.spindle.feed, face: st.cycle.face, parts: st.cycle.parts, status: st.live.spindle.status, phase: st.cycle.phase });
  });
  return (
    <mesh position={[1.347, 1.6, 1.22]} rotation={[0, Math.PI / 2, 0]} material={mat}>
      <planeGeometry args={[0.36, 0.27]} />
    </mesh>
  );
}

function Machine() {
  const shell = useMemo(() => createShellMaterials(), []);
  const parts = useMemo(() => createPartMaterials(), []);
  const xray = useTwin((s) => s.xray);
  useEffect(() => applyXray(shell, xray), [shell, xray]);
  return (
    <group>
      <Housing m={shell} />
      <Hmi />
      <MachiningCell pm={parts} sm={shell} />
      <ServiceUnits pm={parts} />
    </group>
  );
}

function Loader() {
  const { t } = useTranslation();
  const { progress, active } = useProgress();
  if (!active && progress >= 100) return null;
  return (
    <div className="twin-loading" role="status" aria-live="polite">
      <span className="spinner" />
      <span>{t('twin.loading')}</span>
      <div className="bar-track" style={{ width: '12rem', height: '0.35rem', borderRadius: '1rem' }}>
        <div className="bar-fill" style={{ width: `${Math.max(8, progress)}%` }} />
      </div>
    </div>
  );
}

let webglCache: boolean | null = null;
/** testa o suporte a WebGL uma única vez (cada teste cria um contexto) */
export function webglAvailable(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement('canvas');
    const gl = window.WebGLRenderingContext ? c.getContext('webgl2') || c.getContext('webgl') : null;
    webglCache = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

export default function G300Scene() {
  const { t } = useTranslation();
  const controls = useRef<OrbitControlsImpl>(null);
  if (!webglAvailable()) {
    return <ScreenError title={t('twin.loadError')} body={t('twin.noWebgl')} onRetry={() => window.location.reload()} />;
  }
  return (
    <ErrorBoundary fallback={(_e, reset) => <ScreenError title={t('twin.loadError')} body={t('twin.loadErrorBody')} onRetry={reset} />}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: CAMERAS.overview.pos, fov: 34, near: 0.05, far: 80 }}
        gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }}
        onPointerMissed={() => undefined}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        data-testid="twin-canvas"
      >
        <color attach="background" args={['#eef2f5']} />
        <hemisphereLight args={['#ffffff', '#cfd6dd', 0.55]} />
        <directionalLight position={[4, 7, 5]} intensity={1.6} castShadow shadow-mapSize={[1536, 1536]} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} shadow-bias={-0.0004} />
        <directionalLight position={[-5, 3, -3]} intensity={0.45} />
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={2.2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
          <Lightformer intensity={1.2} position={[6, 2, 3]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer intensity={0.8} position={[-6, 2, -2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer intensity={0.6} color="#dbe7f3" position={[0, 2, 7]} scale={[8, 3, 1]} />
        </Environment>
        <Suspense fallback={null}>
          <Machine />
          {/* sombra de contato calculada uma vez, depois que o modelo carrega */}
          <ContactShadows position={[0, 0.002, 0]} scale={9} far={3} blur={2.2} opacity={0.45} resolution={1024} frames={1} />
        </Suspense>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#e6eaee" roughness={0.9} />
        </mesh>
        <OrbitControls ref={controls} target={CAMERAS.overview.target} enableDamping dampingFactor={0.08} minDistance={1.2} maxDistance={14} maxPolarAngle={Math.PI / 2 - 0.03} makeDefault />
        <CameraRig controls={controls} />
        <Projector />
        {typeof window !== 'undefined' && window.location.search.includes('review=unlit') && <UnlitReview />}
      </Canvas>
      <LabelsOverlay />
      <Loader />
    </ErrorBoundary>
  );
}

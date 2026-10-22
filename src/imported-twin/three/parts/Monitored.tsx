import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useTwin } from '../../twin/store';
import type { ComponentId } from '../../twin/whatif';
import { STATUS_COLOR } from '../materials';

/**
 * Envolve um componente monitorado do G300:
 *  - clona os materiais dos filhos para colorir só este componente (emissivo por condição);
 *  - aplica vibração visual proporcional ao RMS (amplitude exagerada para ser perceptível);
 *  - desenha um anel de alerta pulsante quando há atenção/crítico;
 *  - seleciona o componente no painel what-if ao clicar.
 */
export function Monitored({
  id,
  children,
  haloAt,
  haloRadius = 0.25,
  haloAxis = 'y',
}: {
  id: ComponentId;
  children: ReactNode;
  haloAt: [number, number, number];
  haloRadius?: number;
  haloAxis?: 'x' | 'y' | 'z';
}) {
  const shake = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  const select = useTwin((s) => s.select);
  const [hover, setHover] = useState(false);

  useLayoutEffect(() => {
    const list: THREE.MeshStandardMaterial[] = [];
    shake.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.noTint) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat || !('emissive' in mat)) return;
      const clone = mat.clone();
      mesh.material = clone;
      list.push(clone);
    });
    mats.current = list;
    return () => list.forEach((m) => m.dispose());
  }, []);

  useEffect3Cursor(hover);

  useFrame(({ clock }) => {
    const st = useTwin.getState();
    const r = st.live[id];
    const selected = st.selected === id;
    const t = clock.elapsedTime;
    // vibração: amplitude cresce com o RMS acima do nível base
    const amp = Math.max(0, r.rms - 1.4) * 0.0032 + (r.chatter ? 0.004 : 0);
    if (shake.current) {
      const f = 23 + r.rms * 2;
      shake.current.position.set(
        Math.sin(t * f * 6.283) * amp,
        Math.sin(t * f * 4.71 + 1.3) * amp * 0.7,
        Math.cos(t * f * 5.5) * amp * 0.6,
      );
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * (r.status === 'critical' ? 9 : 4.5));
    const color =
      r.status === 'critical'
        ? STATUS_COLOR.critical
        : r.status === 'attention'
          ? STATUS_COLOR.attention
          : selected || hover
            ? STATUS_COLOR.selected
            : STATUS_COLOR.normal;
    const intensity =
      r.status === 'critical'
        ? 0.45 + 0.5 * pulse
        : r.status === 'attention'
          ? 0.22 + 0.33 * pulse
          : hover
            ? 0.18
            : selected
              ? 0.1
              : 0;
    for (const m of mats.current) {
      m.emissive.copy(color);
      m.emissiveIntensity = intensity;
    }
    if (halo.current) {
      const show = r.status !== 'normal' || selected;
      halo.current.visible = show;
      const hm = halo.current.material as THREE.MeshBasicMaterial;
      hm.color.copy(r.status === 'normal' ? STATUS_COLOR.selected : color);
      hm.opacity = r.status === 'normal' ? 0.35 : 0.35 + 0.45 * pulse;
      const sc = 1 + (r.status === 'normal' ? 0 : 0.12 * pulse);
      halo.current.scale.setScalar(sc);
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(id);
  };

  const rot: [number, number, number] =
    haloAxis === 'y' ? [Math.PI / 2, 0, 0] : haloAxis === 'z' ? [0, 0, 0] : [0, Math.PI / 2, 0];

  return (
    <group
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      <group ref={shake}>{children}</group>
      <mesh
        ref={halo}
        position={haloAt}
        rotation={rot}
        userData={{ noTint: true, noOcclude: true }}
        renderOrder={5}
      >
        <torusGeometry args={[haloRadius, 0.012, 8, 64]} />
        <meshBasicMaterial transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function useEffect3Cursor(hover: boolean) {
  useLayoutEffect(() => {
    if (!hover) return undefined;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hover]);
}

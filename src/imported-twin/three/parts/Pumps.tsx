import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useTwin } from '../../twin/store';
import { cavitation, type ComponentId } from '../../twin/whatif';
import type { PartMaterials } from '../materials';
import { Monitored } from './Monitored';

type V3 = [number, number, number];

/**
 * Conjunto motor + bomba (vertical, eixo +Y local):
 * corpo da bomba (voluta) → lanterna com acoplamento visível → motor aletado → tampa do ventilador
 * com a ventoinha girando. Eixo, acoplamento e ventoinha giram na rotação do modelo what-if.
 */
function MotorPump({
  id,
  pm,
  motorR,
  motorL,
  accent,
}: {
  id: ComponentId;
  pm: PartMaterials;
  motorR: number;
  motorL: number;
  accent: THREE.Material;
}) {
  const spin = useRef<THREE.Group>(null);
  const fan = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const r = useTwin.getState().live[id];
    const w = dt * r.shaftRpm * 0.012;
    if (spin.current) spin.current.rotation.y += w;
    if (fan.current) fan.current.rotation.y += w;
  });
  const fins = 16;
  const motorY0 = 0.24;
  const top = motorY0 + motorL;
  return (
    <group>
      {/* corpo da bomba (voluta) e conexões */}
      <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]} material={accent} castShadow>
        <cylinderGeometry args={[motorR * 0.85, motorR * 0.85, 0.11, 28]} />
      </mesh>
      <mesh position={[motorR * 0.9, 0.07, 0]} rotation={[0, 0, Math.PI / 2]} material={accent}>
        <cylinderGeometry args={[0.03, 0.03, 0.08, 16]} />
      </mesh>
      <mesh position={[0, 0.07, motorR * 0.95]} rotation={[Math.PI / 2, 0, 0]} material={accent}>
        <cylinderGeometry args={[0.032, 0.032, 0.07, 16]} />
      </mesh>
      {/* lanterna (abertas, mostrando o acoplamento) */}
      {[0, 1, 2, 3].map((k) => (
        <mesh
          key={k}
          position={[
            Math.cos((k * Math.PI) / 2 + 0.6) * motorR * 0.7,
            0.18,
            Math.sin((k * Math.PI) / 2 + 0.6) * motorR * 0.7,
          ]}
          material={pm.motor}
        >
          <boxGeometry args={[0.02, 0.1, 0.02]} />
        </mesh>
      ))}
      <mesh position={[0, 0.13, 0]} rotation={[Math.PI / 2, 0, 0]} material={pm.motor}>
        <torusGeometry args={[motorR * 0.72, 0.012, 6, 24]} />
      </mesh>
      {/* motor: carcaça aletada */}
      <mesh position={[0, motorY0 + motorL / 2, 0]} material={pm.motor} castShadow>
        <cylinderGeometry args={[motorR, motorR, motorL, 32]} />
      </mesh>
      {Array.from({ length: fins }, (_, k) => {
        const a = (k / fins) * Math.PI * 2;
        return (
          <mesh
            key={k}
            position={[
              Math.cos(a) * (motorR + 0.008),
              motorY0 + motorL / 2,
              Math.sin(a) * (motorR + 0.008),
            ]}
            rotation={[0, -a, 0]}
            material={pm.motor}
          >
            <boxGeometry args={[0.018, motorL * 0.92, 0.006]} />
          </mesh>
        );
      })}
      <mesh position={[0, motorY0 - 0.012, 0]} material={pm.motor}>
        <cylinderGeometry args={[motorR * 1.18, motorR * 1.18, 0.024, 32]} />
      </mesh>
      {/* caixa de ligação */}
      <RoundedBox
        args={[0.07, 0.08, 0.09]}
        radius={0.01}
        smoothness={2}
        position={[motorR + 0.03, motorY0 + motorL * 0.6, 0]}
        material={pm.motor}
      />
      {/* tampa do ventilador com grelha */}
      {[0.35, 0.6, 0.85].map((f) => (
        <mesh
          key={f}
          position={[0, top + 0.035, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={pm.darkSteel}
        >
          <torusGeometry args={[motorR * f, 0.005, 6, 28]} />
        </mesh>
      ))}
      <mesh position={[0, top + 0.035, 0]} material={pm.darkSteel}>
        <cylinderGeometry args={[motorR * 1.02, motorR * 1.02, 0.07, 32, 1, true]} />
      </mesh>
      {/* partes girantes: eixo, acoplamento e ventoinha */}
      <group ref={spin}>
        <mesh position={[0, 0.18, 0]} material={pm.steel}>
          <cylinderGeometry args={[0.014, 0.014, 0.16, 10]} />
        </mesh>
        <mesh position={[0, 0.18, 0]} material={pm.brass}>
          <cylinderGeometry args={[0.035, 0.035, 0.05, 12]} />
        </mesh>
        <mesh position={[0, 0.18, 0]} material={pm.black}>
          <boxGeometry args={[0.085, 0.025, 0.02]} />
        </mesh>
      </group>
      <group ref={fan} position={[0, top + 0.03, 0]}>
        {Array.from({ length: 6 }, (_, k) => (
          <mesh key={k} rotation={[0.35, (k * Math.PI) / 3, 0]} material={pm.black}>
            <boxGeometry args={[motorR * 1.7, 0.004, 0.03]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** textura listrada para indicar fluxo nas mangueiras */
function useFlowTexture(color: string, stripe: string) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 8;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 64, 8);
      ctx.fillStyle = stripe;
      ctx.fillRect(0, 0, 18, 8);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [color, stripe]);
}

function Hose({
  points,
  radius,
  tex,
  speed,
}: {
  points: V3[];
  radius: number;
  tex: THREE.Texture;
  speed: () => number;
}) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      false,
      'catmullrom',
      0.2,
    );
    return { g: new THREE.TubeGeometry(curve, 64, radius, 10, false), len: curve.getLength() };
  }, [points, radius]);
  const mat = useMemo(() => {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(geo.len * 9, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  }, [tex, geo.len]);
  useFrame((_, dt) => {
    if (mat.map) mat.map.offset.x -= dt * speed();
  });
  return <mesh geometry={geo.g} material={mat} castShadow />;
}

export default function ServiceUnits({ pm }: { pm: PartMaterials }) {
  const hydTex = useFlowTexture('#2b3036', '#6d7a86');
  const coolTex = useFlowTexture('#c9d2da', '#3d8fd6');
  const hpTex = useFlowTexture('#3a4048', '#d77a1c');
  const gauge = useRef<THREE.Mesh>(null);

  const flow = (id: 'bomba1' | 'bomba2' | 'bomba3') => () => {
    const p = useTwin.getState().params[id];
    return (p.frequency / 50) * (1 - 0.7 * cavitation(p.tankLevel)) * 0.9;
  };

  useFrame(() => {
    const p = useTwin.getState().params.bomba2;
    if (gauge.current) gauge.current.rotation.z = -((p.pressure - 40) / 120) * Math.PI * 1.4 + 0.7;
  });

  const accentBlue = pm.motorBlue;

  return (
    <group name="service-units">
      {/* ---------- Bomba 2: unidade hidráulica (tanque + motor-bomba vertical) */}
      <mesh position={[0.88, 0.32, -1.42]} material={pm.tank} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.38, 0.5]} />
      </mesh>
      <mesh position={[1.135, 0.3, -1.3]} material={pm.black}>
        <boxGeometry args={[0.012, 0.16, 0.05]} />
      </mesh>
      <mesh position={[0.74, 0.54, -1.6]} material={pm.black}>
        <cylinderGeometry args={[0.035, 0.035, 0.06, 16]} />
      </mesh>
      <Monitored id="bomba2" haloAt={[0.9, 0.73, -1.38]} haloRadius={0.2}>
        <group position={[0.9, 0.51, -1.38]}>
          <MotorPump id="bomba2" pm={pm} motorR={0.1} motorL={0.32} accent={accentBlue} />
        </group>
        {/* bloco de válvulas com solenoides e manômetro */}
        <mesh position={[0.72, 0.56, -1.25]} material={pm.aluminium}>
          <boxGeometry args={[0.12, 0.08, 0.16]} />
        </mesh>
        {[-0.05, 0.0, 0.05].map((z) => (
          <mesh key={z} position={[0.72, 0.64, -1.25 + z]} material={pm.black}>
            <boxGeometry args={[0.04, 0.07, 0.035]} />
          </mesh>
        ))}
      </Monitored>
      <group position={[1.04, 0.66, -1.18]} rotation={[0, Math.PI / 2, 0]}>
        <mesh material={pm.steel}>
          <cylinderGeometry args={[0.045, 0.045, 0.02, 24]} />
        </mesh>
        <mesh position={[0, 0, 0.011]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.04, 24]} />
          <meshStandardMaterial color="#f4f6f8" />
        </mesh>
        <mesh ref={gauge} position={[0, 0, 0.013]} material={pm.red}>
          <boxGeometry args={[0.004, 0.034, 0.002]} />
        </mesh>
      </group>
      {/* acumulador de bexiga (vermelho) */}
      <group position={[1.0, 0, -0.98]}>
        <mesh position={[0, 1.2, 0]} material={pm.red} castShadow>
          <cylinderGeometry args={[0.085, 0.085, 0.42, 28]} />
        </mesh>
        <mesh position={[0, 1.41, 0]} material={pm.red}>
          <sphereGeometry args={[0.085, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 0.99, 0]} rotation={[Math.PI, 0, 0]} material={pm.red}>
          <sphereGeometry args={[0.085, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 1.47, 0]} material={pm.steel}>
          <cylinderGeometry args={[0.02, 0.02, 0.05, 12]} />
        </mesh>
        {[1.05, 1.32].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={pm.darkSteel}>
            <torusGeometry args={[0.09, 0.008, 6, 24]} />
          </mesh>
        ))}
      </group>

      {/* ---------- Bomba 1: refrigeração (tanque baixo + bomba vertical) */}
      <mesh position={[0.88, 0.27, -0.6]} material={pm.tank} castShadow receiveShadow>
        <boxGeometry args={[0.52, 0.28, 0.42]} />
      </mesh>
      <Monitored id="bomba1" haloAt={[0.92, 0.6, -0.6]} haloRadius={0.17}>
        <group position={[0.92, 0.41, -0.6]}>
          <MotorPump id="bomba1" pm={pm} motorR={0.085} motorL={0.26} accent={pm.motor} />
        </group>
      </Monitored>

      {/* ---------- Bomba 3: alta pressão (horizontal na prateleira) */}
      <Monitored id="bomba3" haloAt={[0.9, 1.35, -1.38]} haloRadius={0.16} haloAxis="z">
        <group position={[0.9, 1.35, -1.08]} rotation={[-Math.PI / 2, 0, 0]}>
          <MotorPump id="bomba3" pm={pm} motorR={0.085} motorL={0.3} accent={pm.darkSteel} />
        </group>
        <mesh position={[0.9, 1.26, -1.38]} material={pm.darkSteel}>
          <boxGeometry args={[0.22, 0.03, 0.5]} />
        </mesh>
      </Monitored>
      {/* filtro de alta pressão */}
      <mesh position={[1.06, 1.41, -1.0]} material={pm.steel}>
        <cylinderGeometry args={[0.04, 0.04, 0.22, 20]} />
      </mesh>

      {/* ---------- quadro com medidor trifásico (alimentação da máquina) */}
      <group position={[1.06, 1.66, -1.55]}>
        <mesh material={pm.tank}>
          <boxGeometry args={[0.06, 0.5, 0.36]} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh
            key={i}
            position={[0.035, 0.12, -0.14 + i * 0.04]}
            material={i < 3 ? pm.motorBlue : pm.black}
          >
            <boxGeometry args={[0.02, 0.09, 0.03]} />
          </mesh>
        ))}
        <mesh position={[0.036, -0.08, 0]}>
          <boxGeometry args={[0.012, 0.09, 0.16]} />
          <meshStandardMaterial color="#0f2a1a" emissive="#25d07a" emissiveIntensity={0.6} />
        </mesh>
        {/* sensores de corrente (TCs) */}
        {[-0.06, 0, 0.06].map((z) => (
          <mesh
            key={z}
            position={[0.04, -0.18, z]}
            rotation={[0, 0, Math.PI / 2]}
            material={pm.black}
          >
            <torusGeometry args={[0.018, 0.008, 6, 16]} />
          </mesh>
        ))}
      </group>

      {/* ---------- mangueiras com fluxo animado */}
      <Hose
        tex={hydTex}
        radius={0.016}
        speed={flow('bomba2')}
        points={[
          [0.9, 0.58, -1.27],
          [0.9, 0.62, -1.15],
          [0.78, 0.9, -1.08],
          [0.62, 1.25, -1.05],
          [0.57, 1.5, -1.05],
        ]}
      />
      <Hose
        tex={coolTex}
        radius={0.02}
        speed={flow('bomba1')}
        points={[
          [0.99, 0.48, -0.6],
          [1.0, 0.7, -0.62],
          [0.8, 1.0, -0.4],
          [0.62, 1.15, -0.34],
          [0.57, 1.2, -0.34],
        ]}
      />
      <Hose
        tex={hpTex}
        radius={0.013}
        speed={flow('bomba3')}
        points={[
          [0.9, 1.37, -1.12],
          [0.98, 1.45, -1.05],
          [0.85, 1.55, -0.95],
          [0.62, 1.52, -0.9],
          [0.57, 1.5, -0.9],
        ]}
      />
    </group>
  );
}
